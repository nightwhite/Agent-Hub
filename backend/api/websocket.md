# WebSocket protocol draft

Endpoint:
- wss://{host}/api/v1/agents/{agent-name}/ws

Recommended client -> server message envelope:

```json
{
  "type": "terminal.input",
  "requestId": "req_123",
  "data": {
    "input": "ls -la\n"
  }
}
```

Recommended server -> client message envelope:

```json
{
  "type": "terminal.output",
  "requestId": "req_123",
  "data": {
    "output": "total 8\n..."
  }
}
```

Suggested message types:
- auth
- ping
- pong
- error
- log.subscribe
- log.unsubscribe
- log.chunk
- terminal.open
- terminal.resize
- terminal.input
- terminal.output
- terminal.close
- file.list
- file.read
- file.write
- file.delete
- file.mkdir
- file.download
- file.upload.begin
- file.upload.chunk
- file.upload.end
