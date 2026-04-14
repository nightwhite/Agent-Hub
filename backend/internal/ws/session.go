package ws

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/remotecommand"

	"github.com/nightwhite/Agent-Hub/internal/config"
	"github.com/nightwhite/Agent-Hub/internal/dto"
	"github.com/nightwhite/Agent-Hub/internal/kube"
	appErr "github.com/nightwhite/Agent-Hub/pkg/errors"
	resp "github.com/nightwhite/Agent-Hub/pkg/response"
)

const (
	fileRootDir         = "/opt/hermes"
	wsReadLimit         = 1 << 20
	wsWriteWait         = 10 * time.Second
	wsPongWait          = 60 * time.Second
	wsPingPeriod        = (wsPongWait * 9) / 10
	wsAuthTimeout       = 15 * time.Second
	maxFileReadSize     = 1 << 20
	maxFileDownloadSize = 5 << 20
	maxUploadChunkSize  = 1 << 20
)

type Handler struct {
	Config config.Config
}

func (h Handler) Serve(c *gin.Context, requestID string) {
	agentName := strings.TrimSpace(c.Param("agentName"))
	if agentName == "" {
		resp.WriteGinError(c, http.StatusUnprocessableEntity, appErr.New(appErr.CodeInvalidAgentName, "invalid agent name"), requestID)
		return
	}

	upgrader := websocket.Upgrader{
		CheckOrigin: h.checkOrigin,
	}
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}

	session := newSession(conn, requestID, h.Config, agentName, bootstrapAuthorization(c))
	session.run()
}

type session struct {
	conn      *websocket.Conn
	requestID string
	config    config.Config
	agentName string
	sendMu    sync.Mutex
	stateMu   sync.RWMutex
	ctx       context.Context
	cancel    context.CancelFunc

	authorization string
	factory       *kube.Factory
	clientset     *kubernetes.Clientset

	terminals map[string]*terminalSession
	logs      map[string]*logSession
	uploads   map[string]*uploadSession
}

func newSession(conn *websocket.Conn, requestID string, cfg config.Config, agentName, bootstrapAuth string) *session {
	ctx, cancel := context.WithCancel(context.Background())
	return &session{
		conn:          conn,
		requestID:     requestID,
		config:        cfg,
		agentName:     agentName,
		ctx:           ctx,
		cancel:        cancel,
		authorization: strings.TrimSpace(bootstrapAuth),
		terminals:     map[string]*terminalSession{},
		logs:          map[string]*logSession{},
		uploads:       map[string]*uploadSession{},
	}
}

func (s *session) run() {
	defer s.close()

	s.conn.SetReadLimit(wsReadLimit)
	_ = s.conn.SetReadDeadline(time.Now().Add(wsPongWait))
	s.conn.SetPongHandler(func(string) error {
		return s.conn.SetReadDeadline(time.Now().Add(wsPongWait))
	})

	pingDone := make(chan struct{})
	go s.pingLoop(pingDone)

	if s.authorization != "" {
		if err := s.authenticate(s.authorization); err != nil {
			s.sendAppError(s.requestID, err)
			close(pingDone)
			return
		}
		podRef, podErr := s.currentPod()
		if podErr != nil {
			s.sendAppError(s.requestID, podErr)
			close(pingDone)
			return
		}
		s.sendSystemReady(s.requestID, podRef)
	} else {
		_ = s.conn.SetReadDeadline(time.Now().Add(wsAuthTimeout))
		s.send(dto.WSMessage{
			Type:      "auth.required",
			RequestID: s.requestID,
			Data: map[string]any{
				"message": "send auth message with encoded kubeconfig",
			},
		})
	}

	for {
		var message dto.WSMessage
		if err := s.conn.ReadJSON(&message); err != nil {
			close(pingDone)
			return
		}
		s.handleMessage(message)
	}
}

func (s *session) close() {
	s.cancel()

	s.stateMu.Lock()
	for _, terminal := range s.terminals {
		terminal.close()
	}
	for _, logStream := range s.logs {
		logStream.close()
	}
	s.terminals = map[string]*terminalSession{}
	s.logs = map[string]*logSession{}
	s.uploads = map[string]*uploadSession{}
	s.stateMu.Unlock()

	_ = s.conn.Close()
}

func (s *session) pingLoop(done <-chan struct{}) {
	ticker := time.NewTicker(wsPingPeriod)
	defer ticker.Stop()

	for {
		select {
		case <-done:
			return
		case <-s.ctx.Done():
			return
		case <-ticker.C:
			s.sendMu.Lock()
			_ = s.conn.SetWriteDeadline(time.Now().Add(wsWriteWait))
			err := s.conn.WriteMessage(websocket.PingMessage, nil)
			s.sendMu.Unlock()
			if err != nil {
				return
			}
		}
	}
}

func (s *session) handleMessage(message dto.WSMessage) {
	if err := validateMessage(message); err != nil {
		s.sendError(message.RequestID, "invalid_message", err.Error())
		return
	}

	switch message.Type {
	case "ping":
		s.send(dto.WSMessage{Type: "pong", RequestID: message.RequestID})
		return
	case "auth":
		s.handleAuth(message)
		return
	}

	if !s.isAuthenticated() {
		s.sendError(message.RequestID, "auth_required", "websocket session is not authenticated")
		return
	}

	switch message.Type {
	case "terminal.open":
		s.openTerminal(message)
	case "terminal.input":
		s.terminalInput(message)
	case "terminal.resize":
		s.terminalResize(message)
	case "terminal.close":
		s.closeTerminal(message)
	case "log.subscribe":
		s.subscribeLogs(message)
	case "log.unsubscribe":
		s.unsubscribeLogs(message)
	case "file.list":
		s.fileList(message)
	case "file.read":
		s.fileRead(message)
	case "file.download":
		s.fileDownload(message)
	case "file.write":
		s.fileWrite(message)
	case "file.delete":
		s.fileDelete(message)
	case "file.mkdir":
		s.fileMkdir(message)
	case "file.upload.begin":
		s.fileUploadBegin(message)
	case "file.upload.chunk":
		s.fileUploadChunk(message)
	case "file.upload.end":
		s.fileUploadEnd(message)
	default:
		s.sendError(message.RequestID, "unsupported_message_type", "unsupported websocket message type")
	}
}

func (s *session) handleAuth(message dto.WSMessage) {
	if s.isAuthenticated() {
		s.sendError(message.RequestID, "already_authenticated", "websocket session is already authenticated")
		return
	}

	auth := getString(message.Data, "authorization")
	if err := s.authenticate(auth); err != nil {
		s.sendAppError(message.RequestID, err)
		return
	}

	_ = s.conn.SetReadDeadline(time.Now().Add(wsPongWait))
	podRef, podErr := s.currentPod()
	if podErr != nil {
		s.sendAppError(message.RequestID, podErr)
		return
	}
	s.sendSystemReady(message.RequestID, podRef)
}

func (s *session) authenticate(encodedAuthorization string) *appErr.AppError {
	factory, err := kube.NewFactoryFromEncodedKubeconfig(encodedAuthorization)
	if err != nil {
		return err
	}

	clientset, kErr := factory.Kubernetes()
	if kErr != nil {
		return appErr.New(appErr.CodeKubernetesOperation, "failed to build kubernetes clientset")
	}

	s.stateMu.Lock()
	s.authorization = encodedAuthorization
	s.factory = factory
	s.clientset = clientset
	s.stateMu.Unlock()

	return nil
}

func (s *session) isAuthenticated() bool {
	s.stateMu.RLock()
	defer s.stateMu.RUnlock()
	return s.factory != nil && s.clientset != nil
}

func (s *session) currentPod() (kube.PodRef, *appErr.AppError) {
	s.stateMu.RLock()
	clientset := s.clientset
	factory := s.factory
	s.stateMu.RUnlock()

	podRef, err := kube.ResolveAgentPod(s.ctx, clientset, factory.Namespace(), s.agentName)
	if err != nil {
		return kube.PodRef{}, appErr.New(appErr.CodeNotFound, err.Error())
	}
	return podRef, nil
}

func (s *session) sendSystemReady(requestID string, podRef kube.PodRef) {
	s.stateMu.RLock()
	namespace := s.factory.Namespace()
	s.stateMu.RUnlock()

	s.send(dto.WSMessage{
		Type:      "system.ready",
		RequestID: requestID,
		Data: map[string]any{
			"agentName": s.agentName,
			"namespace": namespace,
			"podName":   podRef.Name,
			"container": podRef.Container,
			"message":   "websocket connected",
		},
	})
}

func (s *session) openTerminal(message dto.WSMessage) {
	id := sessionID(message)

	s.stateMu.Lock()
	defer s.stateMu.Unlock()
	if _, exists := s.terminals[id]; exists {
		s.sendError(message.RequestID, "terminal_already_open", "terminal session already open")
		return
	}

	cwd, err := resolveFilePath(getString(message.Data, "cwd"))
	if err != nil {
		s.sendError(message.RequestID, "invalid_path", err.Error())
		return
	}

	term := newTerminalSession(s, id, message.RequestID)
	s.terminals[id] = term
	s.send(dto.WSMessage{
		Type:      "terminal.opened",
		RequestID: message.RequestID,
		Data: map[string]any{
			"id":  id,
			"cwd": cwd,
		},
	})

	go term.run(cwd)
}

func (s *session) terminalInput(message dto.WSMessage) {
	terminal := s.lookupTerminal(sessionID(message))
	if terminal == nil {
		s.sendError(message.RequestID, "terminal_not_open", "terminal session is not open")
		return
	}

	if _, err := io.WriteString(terminal.stdin, getString(message.Data, "input")); err != nil {
		s.sendError(message.RequestID, "terminal_write_failed", err.Error())
	}
}

func (s *session) terminalResize(message dto.WSMessage) {
	terminal := s.lookupTerminal(sessionID(message))
	if terminal == nil {
		s.sendError(message.RequestID, "terminal_not_open", "terminal session is not open")
		return
	}

	cols := int(getNumber(message.Data, "cols"))
	rows := int(getNumber(message.Data, "rows"))
	if cols <= 0 || rows <= 0 {
		s.sendError(message.RequestID, "invalid_terminal_size", "terminal size must be positive")
		return
	}
	terminal.resize(cols, rows)
}

func (s *session) closeTerminal(message dto.WSMessage) {
	id := sessionID(message)
	terminal := s.lookupTerminal(id)
	if terminal == nil {
		return
	}
	terminal.close()
	terminal.emitClosed(message.RequestID)
	s.removeTerminal(id)
}

func (s *session) subscribeLogs(message dto.WSMessage) {
	id := sessionID(message)
	logSession := newLogSession(s, id, message.RequestID)

	s.stateMu.Lock()
	if existing, exists := s.logs[id]; exists {
		existing.close()
	}
	s.logs[id] = logSession
	s.stateMu.Unlock()

	go logSession.run(corev1.PodLogOptions{
		Follow:    true,
		TailLines: optionalInt64(getNumber(message.Data, "tailLines")),
	})
}

func (s *session) unsubscribeLogs(message dto.WSMessage) {
	id := sessionID(message)
	logSession := s.lookupLog(id)
	if logSession == nil {
		return
	}
	logSession.close()
	logSession.emitClosed(message.RequestID)
	s.removeLog(id)
}

func (s *session) fileList(message dto.WSMessage) {
	resolved, err := resolveFilePath(getString(message.Data, "path"))
	if err != nil {
		s.sendError(message.RequestID, "invalid_path", err.Error())
		return
	}

	output, execErr := s.execCapture([]string{"sh", "-lc", listCommand(resolved)}, "")
	if execErr != nil {
		s.sendError(message.RequestID, "file_list_failed", execErr.Error())
		return
	}

	items := filterListItems(
		parseListOutput(output),
		getBool(message.Data, "includeHidden"),
		getString(message.Data, "filter"),
		int(getNumber(message.Data, "limit")),
		int(getNumber(message.Data, "offset")),
	)
	s.send(dto.WSMessage{Type: "file.result", RequestID: message.RequestID, Data: map[string]any{
		"op":     "list",
		"path":   resolved,
		"items":  items,
		"filter": getString(message.Data, "filter"),
	}})
}

func (s *session) fileRead(message dto.WSMessage) {
	resolved, err := resolveFilePath(getString(message.Data, "path"))
	if err != nil {
		s.sendError(message.RequestID, "invalid_path", err.Error())
		return
	}

	output, execErr := s.execCapture([]string{"sh", "-lc", "cat -- " + shellQuote(resolved)}, "")
	if execErr != nil {
		s.sendError(message.RequestID, "file_read_failed", execErr.Error())
		return
	}
	if len(output) > maxFileReadSize {
		s.sendError(message.RequestID, "file_too_large", "file exceeds maximum inline read size")
		return
	}

	s.send(dto.WSMessage{Type: "file.result", RequestID: message.RequestID, Data: map[string]any{
		"op":      "read",
		"path":    resolved,
		"content": output,
	}})
}

func (s *session) fileDownload(message dto.WSMessage) {
	resolved, err := resolveFilePath(getString(message.Data, "path"))
	if err != nil {
		s.sendError(message.RequestID, "invalid_path", err.Error())
		return
	}

	output, execErr := s.execCapture([]string{"sh", "-lc", "cat -- " + shellQuote(resolved)}, "")
	if execErr != nil {
		s.sendError(message.RequestID, "file_download_failed", execErr.Error())
		return
	}
	if len(output) > maxFileDownloadSize {
		s.sendError(message.RequestID, "file_too_large", "file exceeds maximum download size")
		return
	}

	s.send(dto.WSMessage{Type: "file.result", RequestID: message.RequestID, Data: map[string]any{
		"op":       "download",
		"path":     resolved,
		"content":  base64.StdEncoding.EncodeToString([]byte(output)),
		"encoding": "base64",
	}})
}

func (s *session) fileWrite(message dto.WSMessage) {
	resolved, err := resolveFilePath(getString(message.Data, "path"))
	if err != nil {
		s.sendError(message.RequestID, "invalid_path", err.Error())
		return
	}

	if _, execErr := s.execCapture([]string{"sh", "-lc", "cat > " + shellQuote(resolved)}, getString(message.Data, "content")); execErr != nil {
		s.sendError(message.RequestID, "file_write_failed", execErr.Error())
		return
	}

	s.send(dto.WSMessage{Type: "file.result", RequestID: message.RequestID, Data: map[string]any{
		"op":      "write",
		"path":    resolved,
		"written": true,
	}})
}

func (s *session) fileDelete(message dto.WSMessage) {
	resolved, err := resolveFilePath(getString(message.Data, "path"))
	if err != nil {
		s.sendError(message.RequestID, "invalid_path", err.Error())
		return
	}

	if _, execErr := s.execCapture([]string{"sh", "-lc", "rm -rf -- " + shellQuote(resolved)}, ""); execErr != nil {
		s.sendError(message.RequestID, "file_delete_failed", execErr.Error())
		return
	}

	s.send(dto.WSMessage{Type: "file.result", RequestID: message.RequestID, Data: map[string]any{
		"op":      "delete",
		"path":    resolved,
		"deleted": true,
	}})
}

func (s *session) fileMkdir(message dto.WSMessage) {
	resolved, err := resolveFilePath(getString(message.Data, "path"))
	if err != nil {
		s.sendError(message.RequestID, "invalid_path", err.Error())
		return
	}

	if _, execErr := s.execCapture([]string{"sh", "-lc", "mkdir -p -- " + shellQuote(resolved)}, ""); execErr != nil {
		s.sendError(message.RequestID, "file_mkdir_failed", execErr.Error())
		return
	}

	s.send(dto.WSMessage{Type: "file.result", RequestID: message.RequestID, Data: map[string]any{
		"op":      "mkdir",
		"path":    resolved,
		"created": true,
	}})
}

func (s *session) fileUploadBegin(message dto.WSMessage) {
	id := sessionID(message)
	resolved, err := resolveFilePath(getString(message.Data, "path"))
	if err != nil {
		s.sendError(message.RequestID, "invalid_path", err.Error())
		return
	}

	s.stateMu.Lock()
	s.uploads[id] = &uploadSession{ID: id, Path: resolved}
	s.stateMu.Unlock()

	s.send(dto.WSMessage{Type: "file.result", RequestID: message.RequestID, Data: map[string]any{
		"op":       "upload.begin",
		"id":       id,
		"path":     resolved,
		"accepted": true,
	}})
}

func (s *session) fileUploadChunk(message dto.WSMessage) {
	id := sessionID(message)
	upload := s.lookupUpload(id)
	if upload == nil {
		s.sendError(message.RequestID, "upload_not_found", "upload session is not open")
		return
	}

	chunk := getString(message.Data, "chunk")
	decoded, err := base64.StdEncoding.DecodeString(chunk)
	if err != nil {
		s.sendError(message.RequestID, "invalid_chunk", "upload chunk must be base64")
		return
	}
	if len(decoded) > maxUploadChunkSize {
		s.sendError(message.RequestID, "chunk_too_large", "upload chunk exceeds maximum size")
		return
	}

	upload.Buffer.Write(decoded)
	s.send(dto.WSMessage{Type: "file.result", RequestID: message.RequestID, Data: map[string]any{
		"op":   "upload.chunk",
		"id":   id,
		"size": upload.Buffer.Len(),
	}})
}

func (s *session) fileUploadEnd(message dto.WSMessage) {
	id := sessionID(message)
	upload := s.lookupUpload(id)
	if upload == nil {
		s.sendError(message.RequestID, "upload_not_found", "upload session is not open")
		return
	}

	if _, execErr := s.execCapture([]string{"sh", "-lc", "cat > " + shellQuote(upload.Path)}, upload.Buffer.String()); execErr != nil {
		s.sendError(message.RequestID, "file_upload_failed", execErr.Error())
		return
	}

	s.removeUpload(id)
	s.send(dto.WSMessage{Type: "file.result", RequestID: message.RequestID, Data: map[string]any{
		"op":      "upload.end",
		"id":      id,
		"path":    upload.Path,
		"written": true,
	}})
}

func (s *session) execCapture(command []string, stdin string) (string, error) {
	pod, podErr := s.currentPod()
	if podErr != nil {
		return "", fmt.Errorf("%s", podErr.Error())
	}

	s.stateMu.RLock()
	clientset := s.clientset
	factory := s.factory
	s.stateMu.RUnlock()

	ctx, cancel := context.WithTimeout(s.ctx, 30*time.Second)
	defer cancel()

	var stdout strings.Builder
	var stderr strings.Builder
	var stdinReader io.Reader
	if stdin != "" {
		stdinReader = strings.NewReader(stdin)
	}

	err := kube.ExecInPod(ctx, clientset, factory.RESTConfig(), factory.Namespace(), pod.Name, pod.Container, command, stdinReader, &stdout, &stderr, false, nil)
	if err != nil {
		if stderr.Len() > 0 {
			return "", fmt.Errorf("%s: %w", strings.TrimSpace(stderr.String()), err)
		}
		return "", err
	}
	if stderr.Len() > 0 {
		return "", fmt.Errorf("%s", strings.TrimSpace(stderr.String()))
	}
	return stdout.String(), nil
}

func (s *session) send(msg dto.WSMessage) {
	_ = s.sendJSON(msg)
}

func (s *session) sendAppError(requestID string, err *appErr.AppError) {
	s.send(dto.WSMessage{
		Type:      "error",
		RequestID: requestID,
		Data: map[string]any{
			"code":    err.Type(),
			"message": err.Error(),
			"details": err.Details(),
		},
	})
}

func (s *session) sendError(requestID, code, message string) {
	s.send(dto.WSMessage{
		Type:      "error",
		RequestID: requestID,
		Data: map[string]any{
			"code":    code,
			"message": message,
		},
	})
}

func (s *session) sendJSON(v any) error {
	s.sendMu.Lock()
	defer s.sendMu.Unlock()

	_ = s.conn.SetWriteDeadline(time.Now().Add(wsWriteWait))
	return s.conn.WriteJSON(v)
}

func (s *session) lookupTerminal(id string) *terminalSession {
	s.stateMu.RLock()
	defer s.stateMu.RUnlock()
	return s.terminals[id]
}

func (s *session) removeTerminal(id string) {
	s.stateMu.Lock()
	defer s.stateMu.Unlock()
	delete(s.terminals, id)
}

func (s *session) lookupLog(id string) *logSession {
	s.stateMu.RLock()
	defer s.stateMu.RUnlock()
	return s.logs[id]
}

func (s *session) removeLog(id string) {
	s.stateMu.Lock()
	defer s.stateMu.Unlock()
	delete(s.logs, id)
}

func (s *session) lookupUpload(id string) *uploadSession {
	s.stateMu.RLock()
	defer s.stateMu.RUnlock()
	return s.uploads[id]
}

func (s *session) removeUpload(id string) {
	s.stateMu.Lock()
	defer s.stateMu.Unlock()
	delete(s.uploads, id)
}

type terminalSession struct {
	session     *session
	id          string
	requestID   string
	ctx         context.Context
	cancel      context.CancelFunc
	stdinReader *io.PipeReader
	stdin       *io.PipeWriter
	resizeChan  chan remotecommand.TerminalSize
	closed      sync.Once
	emitted     sync.Once
}

func newTerminalSession(s *session, id, requestID string) *terminalSession {
	ctx, cancel := context.WithCancel(s.ctx)
	stdinReader, stdinWriter := io.Pipe()
	return &terminalSession{
		session:     s,
		id:          id,
		requestID:   requestID,
		ctx:         ctx,
		cancel:      cancel,
		stdinReader: stdinReader,
		stdin:       stdinWriter,
		resizeChan:  make(chan remotecommand.TerminalSize, 8),
	}
}

func (t *terminalSession) run(cwd string) {
	writer := &wsChunkWriter{
		session:   t.session,
		msgType:   "terminal.output",
		requestID: t.requestID,
		dataKey:   "output",
		id:        t.id,
	}

	pod, podErr := t.session.currentPod()
	if podErr != nil {
		t.session.sendAppError(t.requestID, podErr)
		t.emitClosed(t.requestID)
		t.session.removeTerminal(t.id)
		return
	}

	t.session.stateMu.RLock()
	clientset := t.session.clientset
	factory := t.session.factory
	t.session.stateMu.RUnlock()

	command := []string{"sh", "-lc", "cd -- " + shellQuote(cwd) + " && exec sh"}
	err := kube.ExecInPod(t.ctx, clientset, factory.RESTConfig(), factory.Namespace(), pod.Name, pod.Container, command, t.stdinReader, writer, writer, true, terminalSizeQueue(t.resizeChan))
	if err != nil && t.ctx.Err() == nil {
		t.session.sendError(t.requestID, "terminal_exec_failed", err.Error())
	}
	t.emitClosed(t.requestID)
	t.session.removeTerminal(t.id)
}

func (t *terminalSession) resize(cols, rows int) {
	select {
	case t.resizeChan <- remotecommand.TerminalSize{Width: uint16(cols), Height: uint16(rows)}:
	default:
	}
}

func (t *terminalSession) close() {
	t.closed.Do(func() {
		t.cancel()
		if t.stdin != nil {
			_ = t.stdin.Close()
		}
	})
}

func (t *terminalSession) emitClosed(requestID string) {
	t.emitted.Do(func() {
		t.session.send(dto.WSMessage{
			Type:      "terminal.closed",
			RequestID: requestID,
			Data:      map[string]any{"id": t.id},
		})
	})
}

type terminalSizeQueue chan remotecommand.TerminalSize

func (q terminalSizeQueue) Next() *remotecommand.TerminalSize {
	size, ok := <-q
	if !ok {
		return nil
	}
	return &size
}

type logSession struct {
	session   *session
	id        string
	requestID string
	ctx       context.Context
	cancel    context.CancelFunc
	emitted   sync.Once
}

func newLogSession(s *session, id, requestID string) *logSession {
	ctx, cancel := context.WithCancel(s.ctx)
	return &logSession{session: s, id: id, requestID: requestID, ctx: ctx, cancel: cancel}
}

func (l *logSession) run(opts corev1.PodLogOptions) {
	pod, podErr := l.session.currentPod()
	if podErr != nil {
		l.session.sendAppError(l.requestID, podErr)
		l.emitClosed(l.requestID)
		l.session.removeLog(l.id)
		return
	}

	l.session.stateMu.RLock()
	clientset := l.session.clientset
	factory := l.session.factory
	l.session.stateMu.RUnlock()

	stream, err := kube.StreamPodLogs(l.ctx, clientset, factory.Namespace(), pod.Name, pod.Container, &opts)
	if err != nil {
		l.session.sendError(l.requestID, "log_stream_failed", err.Error())
		return
	}
	defer stream.Close()

	scanner := bufio.NewScanner(stream)
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 1024*1024)
	for scanner.Scan() {
		l.session.send(dto.WSMessage{
			Type:      "log.chunk",
			RequestID: l.requestID,
			Data: map[string]any{
				"id":    l.id,
				"chunk": scanner.Text(),
			},
		})
	}
	if err := scanner.Err(); err != nil && l.ctx.Err() == nil {
		l.session.sendError(l.requestID, "log_stream_failed", err.Error())
	}
	l.emitClosed(l.requestID)
	l.session.removeLog(l.id)
}

func (l *logSession) close() {
	l.cancel()
}

func (l *logSession) emitClosed(requestID string) {
	l.emitted.Do(func() {
		l.session.send(dto.WSMessage{
			Type:      "log.closed",
			RequestID: requestID,
			Data:      map[string]any{"id": l.id},
		})
	})
}

type uploadSession struct {
	ID     string
	Path   string
	Buffer bytes.Buffer
}

type wsChunkWriter struct {
	session   *session
	msgType   string
	requestID string
	dataKey   string
	id        string
}

func (w *wsChunkWriter) Write(p []byte) (int, error) {
	chunk := string(p)
	if chunk == "" {
		return len(p), nil
	}

	err := w.session.sendJSON(dto.WSMessage{
		Type:      w.msgType,
		RequestID: w.requestID,
		Data: map[string]any{
			"id":      w.id,
			w.dataKey: chunk,
		},
	})
	if err != nil {
		return 0, err
	}
	return len(p), nil
}

func (h Handler) checkOrigin(r *http.Request) bool {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		return true
	}

	originURL, err := url.Parse(origin)
	if err != nil {
		return false
	}

	if originURL.Host == r.Host {
		return true
	}

	for _, allowed := range splitCSV(h.Config.WSAllowedOrigins) {
		if origin == allowed || originURL.Host == allowed {
			return true
		}
	}

	return false
}

func splitCSV(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			out = append(out, part)
		}
	}
	return out
}

func bootstrapAuthorization(c *gin.Context) string {
	if headerValue := strings.TrimSpace(c.GetHeader(kube.DefaultAuthorizationHeader)); headerValue != "" {
		return headerValue
	}
	return strings.TrimSpace(c.Query(kube.WebSocketAuthorizationQueryParam))
}

func sessionID(message dto.WSMessage) string {
	if id := getString(message.Data, "id"); id != "" {
		return id
	}
	if message.RequestID != "" {
		return message.RequestID
	}
	return "default"
}

func getString(data map[string]any, key string) string {
	if data == nil {
		return ""
	}
	value, _ := data[key]
	text, _ := value.(string)
	return strings.TrimSpace(text)
}

func getNumber(data map[string]any, key string) float64 {
	if data == nil {
		return 0
	}
	switch value := data[key].(type) {
	case float64:
		return value
	case int:
		return float64(value)
	case string:
		parsed, _ := strconv.ParseFloat(strings.TrimSpace(value), 64)
		return parsed
	default:
		return 0
	}
}

func getBool(data map[string]any, key string) bool {
	if data == nil {
		return false
	}
	switch value := data[key].(type) {
	case bool:
		return value
	case string:
		return strings.EqualFold(strings.TrimSpace(value), "true")
	default:
		return false
	}
}

func optionalInt64(v float64) *int64 {
	if v <= 0 {
		return nil
	}
	result := int64(v)
	return &result
}

func resolveFilePath(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "." {
		return fileRootDir, nil
	}
	if path.IsAbs(raw) {
		return "", fmt.Errorf("absolute paths are not allowed")
	}

	cleaned := path.Clean(raw)
	if cleaned == ".." || strings.HasPrefix(cleaned, "../") {
		return "", fmt.Errorf("path escapes the workspace root")
	}

	resolved := path.Join(fileRootDir, cleaned)
	if !strings.HasPrefix(resolved, fileRootDir) {
		return "", fmt.Errorf("path escapes the workspace root")
	}
	return resolved, nil
}

func shellQuote(input string) string {
	return "'" + strings.ReplaceAll(input, "'", `'\''`) + "'"
}

func listCommand(dir string) string {
	return "dir=" + shellQuote(dir) + "; " +
		"[ -d \"$dir\" ] || { echo 'not_a_directory'; exit 1; }; " +
		"for p in \"$dir\"/.* \"$dir\"/*; do " +
		"[ ! -e \"$p\" ] && continue; " +
		"base=$(basename \"$p\"); " +
		"[ \"$base\" = \".\" ] && continue; " +
		"[ \"$base\" = \"..\" ] && continue; " +
		"if [ -d \"$p\" ]; then kind=dir; elif [ -f \"$p\" ]; then kind=file; else kind=other; fi; " +
		"size=$(wc -c < \"$p\" 2>/dev/null || printf 0); " +
		"printf '%s\t%s\t%s\n' \"$base\" \"$kind\" \"$size\"; " +
		"done"
}

func parseListOutput(raw string) []map[string]any {
	lines := strings.Split(strings.TrimSpace(raw), "\n")
	items := make([]map[string]any, 0, len(lines))
	for _, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		parts := strings.Split(line, "\t")
		if len(parts) != 3 {
			continue
		}
		size, _ := strconv.ParseInt(strings.TrimSpace(parts[2]), 10, 64)
		items = append(items, map[string]any{
			"name": parts[0],
			"type": parts[1],
			"size": size,
		})
	}
	return items
}

func filterListItems(items []map[string]any, includeHidden bool, filter string, limit, offset int) []map[string]any {
	filter = strings.ToLower(strings.TrimSpace(filter))
	filtered := make([]map[string]any, 0, len(items))
	for _, item := range items {
		name := strings.TrimSpace(fmt.Sprint(item["name"]))
		if name == "" {
			continue
		}
		if !includeHidden && strings.HasPrefix(name, ".") {
			continue
		}
		if filter != "" && !strings.Contains(strings.ToLower(name), filter) {
			continue
		}
		filtered = append(filtered, item)
	}

	if offset < 0 {
		offset = 0
	}
	if offset >= len(filtered) {
		return []map[string]any{}
	}
	filtered = filtered[offset:]

	if limit <= 0 {
		limit = 200
	}
	if limit < len(filtered) {
		filtered = filtered[:limit]
	}

	return filtered
}

func validateMessage(message dto.WSMessage) error {
	if strings.TrimSpace(message.Type) == "" {
		return fmt.Errorf("message type is required")
	}

	requiredString := func(key string) error {
		if getString(message.Data, key) == "" {
			return fmt.Errorf("%s is required", key)
		}
		return nil
	}

	requiredID := func() error {
		return requiredString("id")
	}

	switch message.Type {
	case "auth":
		return requiredString("authorization")
	case "terminal.open":
		return requiredID()
	case "terminal.input":
		if err := requiredID(); err != nil {
			return err
		}
		return requiredString("input")
	case "terminal.resize":
		if err := requiredID(); err != nil {
			return err
		}
		if getNumber(message.Data, "cols") <= 0 || getNumber(message.Data, "rows") <= 0 {
			return fmt.Errorf("cols and rows must be positive")
		}
	case "log.subscribe", "log.unsubscribe", "terminal.close":
		return requiredID()
	case "file.list", "file.read", "file.download", "file.delete", "file.mkdir":
		return requiredString("path")
	case "file.write":
		if err := requiredString("path"); err != nil {
			return err
		}
		if _, exists := message.Data["content"]; !exists {
			return fmt.Errorf("content is required")
		}
	case "file.upload.begin":
		if err := requiredID(); err != nil {
			return err
		}
		return requiredString("path")
	case "file.upload.chunk":
		if err := requiredID(); err != nil {
			return err
		}
		return requiredString("chunk")
	case "file.upload.end":
		return requiredID()
	case "ping":
		return nil
	default:
		return nil
	}
	return nil
}
