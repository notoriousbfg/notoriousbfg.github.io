package main

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"text/template"
)

type StringSet map[string]bool

var allowedImageExtensions = []string{".jpg", ".png", ".jpeg"}

// functions available to every template
var templateFuncs = template.FuncMap{
	"lower": strings.ToLower,
}

// renders a page template inside the base layout
func RenderTemplate(templateFile string, data PageData) (string, error) {
	template := template.Must(
		template.New("page").Funcs(templateFuncs).ParseFiles(templateFile, "./templates/base.html"),
	)

	var content bytes.Buffer
	templateErr := template.ExecuteTemplate(&content, "base", data)
	if templateErr != nil {
		return "", fmt.Errorf("error generating template: %+v", templateErr)
	}

	return content.String(), nil
}

// renders a page template and writes it to filePath, creating its directory if needed
func BuildFromTemplate(templateFile string, data PageData, filePath string) error {
	content, err := RenderTemplate(templateFile, data)
	if err != nil {
		return err
	}

	dirErr := os.MkdirAll(filepath.Dir(filePath), os.ModePerm)
	if dirErr != nil {
		return dirErr
	}

	fp, err := os.OpenFile(filePath, os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0755)
	if err != nil {
		return err
	}

	fp.WriteString(content)

	return fp.Close()
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
	files, err := os.ReadDir(dir)
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
