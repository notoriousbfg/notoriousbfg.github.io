package main

import (
	"bytes"
	"fmt"
	"io/ioutil"
	"os"
	"path/filepath"
	"text/template"
)

type StringSet map[string]bool

var allowedImageExtensions = []string{".jpg", ".png", ".jpeg"}

func BuildFromTemplate(templateFile string, data PageData, dirName string) error {
	template := template.Must(
		template.ParseFiles(templateFile, "./templates/base.html"),
	)

	var content bytes.Buffer
	templateErr := template.ExecuteTemplate(&content, "base", data)
	if templateErr != nil {
		return fmt.Errorf("error generating template: %+v", templateErr)
	}

	dirErr := os.MkdirAll(dirName, os.ModePerm)
	if dirErr != nil {
		return dirErr
	}

	newFilePath := fmt.Sprintf("%s/index.html", dirName)
	fp, err := os.OpenFile(newFilePath, os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0755)
	if err != nil {
		return err
	}

	fp.WriteString(content.String())

	return nil
}

func Contains(s []string, e string) bool {
	for _, a := range s {
		if a == e {
			return true
		}
	}
	return false
}

func DirContainsImages(dir string) bool {
	files, err := ioutil.ReadDir(dir)
	if err != nil {
		return false
	}
	for _, file := range files {
		ext := filepath.Ext(file.Name())
		if Contains(allowedImageExtensions, ext) {
			return true
		}
	}
	return false
}
