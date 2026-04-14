package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func Health(c *gin.Context) {
	writeSuccess(c, http.StatusOK, gin.H{"status": "ok"})
}

func Ready(c *gin.Context) {
	writeSuccess(c, http.StatusOK, gin.H{"status": "ready"})
}
