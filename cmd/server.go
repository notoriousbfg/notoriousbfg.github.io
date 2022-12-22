package main

import (
	"fmt"
	"io/ioutil"
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
	go openBrowser(wg)
	wg.Wait()
}

func postPaths() StringSet {
	items, err := ioutil.ReadDir("../posts")
	if err != nil {
		log.Fatal(err)
	}
	pathSet := StringSet{}
	for _, item := range items {
		if item.IsDir() {
			name := item.Name()
			if ok := pathSet[name]; !ok {
				pathSet[name] = true
			}
		}
	}
	return pathSet
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

	defer wg.Done()

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

	fmt.Println("watching posts directory...")
	postPaths := postPaths()
	for path := range postPaths {
		err = watcher.Add(fmt.Sprintf("../posts/%s", path))
		if err != nil {
			log.Fatal(err)
		}
	}
}

func openBrowser(wg *sync.WaitGroup) error {
	var cmd string
	var args []string

	defer wg.Done()

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
