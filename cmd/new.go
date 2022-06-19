package main

import (
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/gosimple/slug"
)

func NewPost(title string) error {
	slug := slug.Make(title)
	newDir := fmt.Sprintf("../posts/%s_%s", time.Now().Format("2006-01-02"), slug)

	err := os.MkdirAll(newDir, os.ModePerm)
	if err != nil {
		return err
	}

	config := &PostConfig{Title: title, Slug: slug, Published: time.Now()}
	b, err := json.MarshalIndent(config, "", "	")
	if err != nil {
		return err
	}

	newConfigFilePath := fmt.Sprintf("%s/config.json", newDir)
	configFilePointer, err := os.OpenFile(newConfigFilePath, os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0755)
	if err != nil {
		return err
	}
	configFilePointer.WriteString(string(b))

	newMDFilePath := fmt.Sprintf("%s/post.md", newDir)
	mdFilePointer, err := os.OpenFile(newMDFilePath, os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0755)
	if err != nil {
		return err
	}
	mdFilePointer.WriteString(fmt.Sprintf("# %s", title))
	fmt.Printf("post \"%s\" successfully created\n", title)
	return nil
}
