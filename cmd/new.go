package main

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/gosimple/slug"
)

func NewPost(config *PostConfig) error {
	slug := slug.Make(config.Title)
	newDir := fmt.Sprintf("../posts/%s_%s", config.Published.Format("2006-01-02"), slug)

	err := os.MkdirAll(newDir, os.ModePerm)
	if err != nil {
		return err
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
	_, err = os.OpenFile(newMDFilePath, os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0755)
	if err != nil {
		return err
	}

	fmt.Printf("%s \"%s\" created\n", config.Category, config.Title)
	return nil
}
