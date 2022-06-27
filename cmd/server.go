package main

import (
	"fmt"
	"net/http"
	"os/exec"
	"runtime"
)

func StartServer() {
	http.Handle("/", http.FileServer(http.Dir("../docs")))
	url := "http://localhost:3000"
	fmt.Printf("Listening at %s...\n", url)
	go open(url)
	http.ListenAndServe(":3000", nil)
}

func open(url string) error {
	var cmd string
	var args []string

	switch runtime.GOOS {
	case "windows":
		cmd = "cmd"
		args = []string{"/c", "start"}
	case "darwin":
		cmd = "open"
	default:
		cmd = "xdg-open"
	}
	args = append(args, url)
	return exec.Command(cmd, args...).Start()
}
