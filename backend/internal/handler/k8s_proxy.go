package handler

import (
	"crypto/tls"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/nightwhite/Agent-Hub/internal/kube"
)

var insecureK8sProxyTransport = &http.Transport{
	Proxy: http.ProxyFromEnvironment,
	DialContext: (&net.Dialer{
		Timeout:   30 * time.Second,
		KeepAlive: 30 * time.Second,
	}).DialContext,
	ForceAttemptHTTP2:     false,
	MaxIdleConns:          100,
	IdleConnTimeout:       90 * time.Second,
	TLSHandshakeTimeout:   10 * time.Second,
	ExpectContinueTimeout: time.Second,
	TLSClientConfig: &tls.Config{
		InsecureSkipVerify: true,
	},
}

type kubeStatus struct {
	Kind       string         `json:"kind"`
	APIVersion string         `json:"apiVersion"`
	Metadata   map[string]any `json:"metadata"`
	Status     string         `json:"status"`
	Message    string         `json:"message"`
	Reason     string         `json:"reason"`
	Code       int            `json:"code"`
}

func KubernetesProxy(c *gin.Context) {
	targetBase := strings.TrimSpace(resolveK8sProxyTarget(c.Request))
	bearerToken := strings.TrimSpace(resolveK8sProxyBearerToken(c.Request))

	if targetBase == "" || bearerToken == "" {
		writeK8sProxyStatus(c, http.StatusUnauthorized, "缺少 Kubernetes 认证信息", "Unauthorized")
		return
	}

	targetURL, err := url.Parse(targetBase)
	if err != nil || strings.TrimSpace(targetURL.Scheme) == "" || strings.TrimSpace(targetURL.Host) == "" {
		writeK8sProxyStatus(c, http.StatusBadGateway, "Bad Gateway", "BadGateway")
		return
	}

	proxy := &httputil.ReverseProxy{
		Transport:     insecureK8sProxyTransport,
		FlushInterval: -1,
		Director: func(req *http.Request) {
			target := targetURL.ResolveReference(&url.URL{
				Path:     proxyPath(req.URL.Path),
				RawQuery: req.URL.RawQuery,
			})

			req.URL.Scheme = target.Scheme
			req.URL.Host = target.Host
			req.URL.Path = target.Path
			req.URL.RawPath = target.RawPath
			req.URL.RawQuery = target.RawQuery
			req.Host = target.Host

			req.Header.Del("Origin")
			req.Header.Del("Referer")
			req.Header.Del("X-K8s-Server")
			req.Header.Del("Authorization-Bearer")
			req.Header.Set("Authorization", "Bearer "+bearerToken)
		},
		ErrorHandler: func(writer http.ResponseWriter, _ *http.Request, proxyErr error) {
			message := "Bad Gateway"
			if proxyErr != nil && strings.TrimSpace(proxyErr.Error()) != "" {
				message = strings.TrimSpace(proxyErr.Error())
			}

			writeK8sProxyError(writer, http.StatusBadGateway, message, "BadGateway")
		},
	}

	proxy.ServeHTTP(c.Writer, c.Request)
}

func resolveK8sProxyTarget(request *http.Request) string {
	if request == nil {
		return ""
	}

	if queryServer := strings.TrimSpace(request.URL.Query().Get("k8sServer")); queryServer != "" {
		return queryServer
	}

	if parsed, err := kube.ParseProxyAuthFromEncodedKubeconfig(request.Header.Get(kube.DefaultAuthorizationHeader)); err == nil {
		if parsed.Server != "" {
			return parsed.Server
		}
	}

	return decodeHeaderScalar(request.Header.Get("X-K8s-Server"))
}

func resolveK8sProxyBearerToken(request *http.Request) string {
	if request == nil {
		return ""
	}

	if parsed, err := kube.ParseProxyAuthFromEncodedKubeconfig(request.Header.Get(kube.DefaultAuthorizationHeader)); err == nil {
		if parsed.Token != "" {
			return parsed.Token
		}
	}

	if headerToken := decodeHeaderScalar(request.Header.Get("Authorization-Bearer")); headerToken != "" {
		return headerToken
	}

	return strings.TrimSpace(request.URL.Query().Get("k8sToken"))
}

func decodeHeaderScalar(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}

	decoded, err := url.QueryUnescape(trimmed)
	if err != nil {
		return trimmed
	}
	return strings.TrimSpace(decoded)
}

func proxyPath(requestPath string) string {
	trimmed := strings.TrimPrefix(strings.TrimSpace(requestPath), "/k8s-api")
	if trimmed == "" {
		return "/"
	}
	if strings.HasPrefix(trimmed, "/") {
		return trimmed
	}
	return "/" + trimmed
}

func writeK8sProxyStatus(c *gin.Context, status int, message, reason string) {
	if c == nil {
		return
	}
	writeK8sProxyError(c.Writer, status, message, reason)
	c.Abort()
}

func writeK8sProxyError(writer http.ResponseWriter, status int, message, reason string) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	_, _ = writer.Write([]byte(mustJSON(kubeStatus{
		Kind:       "Status",
		APIVersion: "v1",
		Metadata:   map[string]any{},
		Status:     statusText(status),
		Message:    message,
		Reason:     reason,
		Code:       status,
	})))
}

func statusText(status int) string {
	if status >= http.StatusBadRequest {
		return "Failure"
	}
	return "Success"
}
