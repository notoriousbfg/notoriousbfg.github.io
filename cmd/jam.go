package main

import (
	b64 "encoding/base64"
	"encoding/json"
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

type spotifyAccessToken struct {
	AccessToken string `json:"access_token"`
}

func NewJam(title string) error {
	// auth spotify api
	cfg := spotifyConfig{}
	if err := env.Parse(&cfg); err != nil {
		return err
	}

	accessTokenResp, err := getSpotifyAccessToken(cfg)
	if err != nil {
		return err
	}
	accessTokenObject := spotifyAccessToken{}
	json.Unmarshal(accessTokenResp, &accessTokenObject)

	// search for track
	tracksResponse, _ := searchTracks(accessTokenObject.AccessToken, title)
	fmt.Printf("%s", tracksResponse)

	// select track

	// write output to json
	return nil
}

func getSpotifyAccessToken(config spotifyConfig) ([]byte, error) {
	form := url.Values{}
	form.Add("grant_type", "client_credentials")
	req, err := http.NewRequest("POST", "https://accounts.spotify.com/api/token", strings.NewReader(form.Encode()))
	if err != nil {
		return []byte{}, err
	}
	encoded := b64.StdEncoding.EncodeToString([]byte(fmt.Sprintf("%s:%s", config.ClientID, config.ClientSecret)))
	req.Header.Set("Authorization", fmt.Sprintf("Basic %s", encoded))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	client := &http.Client{}
	res, err := client.Do(req)
	if err != nil {
		return []byte{}, err
	}
	defer res.Body.Close()
	resBody, err := ioutil.ReadAll(res.Body)
	if err != nil {
		return []byte{}, err
	}
	return resBody, nil
}

func searchTracks(accessToken string, searchString string) ([]byte, error) {
	u, _ := url.ParseRequestURI("https://api.spotify.com/v1/search")
	params := url.Values{}
	params.Add("q", searchString)
	params.Add("type", "track")
	u.RawQuery = params.Encode()
	req, err := http.NewRequest("GET", fmt.Sprintf("%v", u), nil)
	if err != nil {
		return []byte{}, err
	}
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", accessToken))
	client := &http.Client{}
	res, err := client.Do(req)
	if err != nil {
		return []byte{}, err
	}
	defer res.Body.Close()
	resBody, err := ioutil.ReadAll(res.Body)
	if err != nil {
		return []byte{}, err
	}
	return resBody, nil
}
