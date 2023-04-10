package main

import (
	b64 "encoding/base64"
	"fmt"
	"io/ioutil"
	"net/http"
	"net/url"
	"strings"

	"github.com/caarlos0/env"
)

type spotifyConfig struct {
	ClientID     string `env:"SPOTIFY_CLIENT_ID"`
	ClientSecret string `env:"SPOTIFY_CLIENT_SECRET"`
}

func NewJam(title string) error {
	// auth spotify api
	cfg := spotifyConfig{}
	if err := env.Parse(&cfg); err != nil {
		return err
	}

	accessToken, _ := getSpotifyAccessToken(cfg)
	fmt.Printf("%+v", accessToken)

	// search for track

	// select track

	// write output to json
	return nil
}

func getSpotifyAccessToken(config spotifyConfig) (string, error) {
	// reqBody := []byte(`{"grant_type":"client_credentials"}`)
	// req, err := http.NewRequest("POST", "https://accounts.spotify.com/api/token", bytes.NewBuffer(reqBody))
	form := url.Values{}
	form.Add("grant_type", "client_credentials")
	req, err := http.NewRequest("POST", "https://accounts.spotify.com/api/token", strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	encoded := b64.StdEncoding.EncodeToString([]byte(fmt.Sprintf("%s:%s", config.ClientID, config.ClientSecret)))
	req.Header.Set("Authorization", fmt.Sprintf("Basic %s", encoded))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	client := &http.Client{}
	fmt.Printf("%+v", req)
	res, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	resBody, err := ioutil.ReadAll(res.Body)
	if err != nil {
		return "", err
	}
	return string(resBody), nil
}
