package main

import (
	"fmt"
	"log"
	"net/http"
	"os/exec"
	"runtime"
	"time"

	"github.com/radovskyb/watcher"
)

func StartServer() {
	http.Handle("/", http.FileServer(http.Dir("../docs")))
	url := "http://localhost:3000"
	fmt.Printf("Listening at %s...\n", url)
	go open(url)
	http.ListenAndServe(":3000", nil)
}

func WatchFiles() {
	w := watcher.New()
	w.SetMaxEvents(1)
	if err := w.AddRecursive("../posts"); err != nil {
		log.Fatalln(err)
	}
	go func() {
		for {
			select {
			case <-w.Event:
				BuildSite(&site, false)
			case err := <-w.Error:
				log.Fatalln(err)
			case <-w.Closed:
				return
			}
		}
	}()
	if err := w.Start(time.Millisecond * 100); err != nil {
		log.Fatalln(err)
	}
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
