package main

import (
	"fmt"
	"log"
	"net/http"
	"os/exec"
	"runtime"
	"sync"

	"github.com/fsnotify/fsnotify"
)

const (
	siteUrl = "http://localhost:3000"
)

func StartServer() {
	wg := new(sync.WaitGroup)
	wg.Add(3)
	watchFiles(wg)
	runServer(wg)
	openBrowser(wg)
	wg.Wait()
}

func runServer(wg *sync.WaitGroup) {
	http.Handle("/", http.FileServer(http.Dir("../docs")))
	fmt.Printf("Listening at %s...\n", siteUrl)
	go func() {
		err := http.ListenAndServe(":3000", nil)
		if err != nil {
			log.Fatal(err)
		}
		wg.Done()
	}()
}

func watchFiles(wg *sync.WaitGroup) {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		log.Fatal(err)
	}
	defer func() {
		// watcher.Close()
		wg.Done()
	}()

	go func() {
		for {
			select {
			case event, ok := <-watcher.Events:
				if !ok {
					return
				}
				if event.Has(fsnotify.Write) {
					BuildSite(&site, false)
				}
			case err, ok := <-watcher.Errors:
				if !ok {
					return
				}
				log.Println("error:", err)
			}
		}
	}()

	err = watcher.Add("../posts/2022-12-16_easy")
	if err != nil {
		log.Fatal(err)
	}
}

func openBrowser(wg *sync.WaitGroup) error {
	defer wg.Done()
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
	args = append(args, siteUrl)
	return exec.Command(cmd, args...).Start()
}
