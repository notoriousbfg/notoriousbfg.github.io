package main

import (
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/golang-module/carbon"
	"github.com/gosimple/slug"
)

func NewPost(title string, category string, date string, draft bool) error {
	slug := slug.Make(title)
	var published time.Time
	if date != "" {
		published = carbon.Parse(date).Carbon2Time()
	} else {
		published = time.Now()
	}
	newDir := fmt.Sprintf("../posts/%s_%s", published.Format("2006-01-02"), slug)

	err := os.MkdirAll(newDir, os.ModePerm)
	if err != nil {
		return err
	}

	config := &PostConfig{
		Title:     title,
		Slug:      slug,
		Published: published,
		Category:  category,
		Draft:     draft,
	}
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

	if category != "photo" {
		mdFilePointer.WriteString(fmt.Sprintf("# %s", title))
	}

	fmt.Printf("post \"%s\" successfully created\n", title)
	return nil
}
