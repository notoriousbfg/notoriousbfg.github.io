package main

import (
	"bytes"
	"fmt"
	"os"
	"text/template"
)

func buildFromTemplate(templateFile string, data PageData, dirName string) error {
	template := template.Must(
		template.ParseFiles(templateFile, "./templates/base.html"),
	)

	var content bytes.Buffer
	templateErr := template.ExecuteTemplate(&content, "base", data)
	if templateErr != nil {
		return fmt.Errorf("error generating template: \n%+v\n", templateErr)
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
