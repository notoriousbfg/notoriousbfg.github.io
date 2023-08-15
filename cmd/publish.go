package main

import (
	"log"
	"os/exec"
)

func PublishBlog() {
	cmd := exec.Command("git", "add", "--all")
	cmd.Dir = "../"
	err := cmd.Run()

	if err != nil {
		log.Printf("there was a problem staging files: %+v", err)
		return
	}

	cmd = exec.Command("git", "commit", "-m", "publish blog")
	cmd.Dir = "../"
	err = cmd.Run()

	if err != nil {
		log.Printf("there was a problem committing: %+v", err)
		return
	}

	cmd = exec.Command("git", "push", "-u", "origin", "master", "--force")
	cmd.Dir = "../"
	err = cmd.Run()

	if err != nil {
		log.Printf("there was a problem pushing to the remote: %+v", err)
		return
	}
}
