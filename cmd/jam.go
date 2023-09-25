package main

import (
	b64 "encoding/base64"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/caarlos0/env"
	"github.com/manifoldco/promptui"
)

type spotifyConfig struct {
	ClientID     string `env:"SPOTIFY_CLIENT_ID"`
	ClientSecret string `env:"SPOTIFY_CLIENT_SECRET"`
}

type spotifyAccessToken struct {
	AccessToken string `json:"access_token"`
}

type spotifyTrackListing struct {
	Tracks spotifyTrack `json:"tracks"`
}

type spotifyTrack struct {
	Items []spotifyItem `json:"items"`
}

type spotifyItem struct {
	ID         string          `json:"id"`
	Name       string          `json:"name"`
	PreviewURL string          `json:"preview_url"`
	Artists    []spotifyArtist `json:"artists"`
	Album      spotifyAlbum    `json:"album"`
}

func (si spotifyItem) firstArtist() spotifyArtist {
	if len(si.Artists) > 0 {
		return si.Artists[0]
	} else {
		return spotifyArtist{}
	}
}

func (si spotifyItem) albumArt() spotifyImage {
	if len(si.Album.Images) > 0 {
		return si.Album.Images[0]
	} else {
		return spotifyImage{}
	}
}

type spotifyArtist struct {
	Name string `json:"name"`
}

type spotifyAlbum struct {
	Images []spotifyImage `json:"images"`
}

type spotifyImage struct {
	Url string `json:"url"`
}

type Track struct {
	ID         string `json:"-"`
	Name       string `json:"name"`
	ArtistName string `json:"artist"`
	PreviewURL string `json:"preview_url"`
	Image      string `json:"image"`
}

func NewJam(title string, site *Site) error {
	// auth spotify api
	cfg := spotifyConfig{}
	if err := env.Parse(&cfg); err != nil {
		return err
	}

	if len(cfg.ClientID) == 0 || len(cfg.ClientSecret) == 0 {
		return fmt.Errorf("spotify credentials missing")
	}

	accessTokenResp, err := getSpotifyAccessToken(cfg)
	if err != nil {
		return err
	}
	accessTokenObject := spotifyAccessToken{}
	json.Unmarshal(accessTokenResp, &accessTokenObject)

	// search for track
	tracksResponse, _ := searchTracks(accessTokenObject.AccessToken, title)
	tracks := spotifyTrackListing{}
	err = json.Unmarshal(tracksResponse, &tracks)
	if err != nil {
		return err
	}

	if len(tracks.Tracks.Items) == 0 {
		return fmt.Errorf("no tracks found")
	}

	// select track
	trackSelection := make([]Track, 0)
	for _, spotifyItem := range tracks.Tracks.Items {
		trackSelection = append(trackSelection, Track{
			ID:         spotifyItem.ID,
			Name:       spotifyItem.Name,
			ArtistName: spotifyItem.firstArtist().Name,
			PreviewURL: spotifyItem.PreviewURL,
			Image:      spotifyItem.albumArt().Url,
		})
	}
	selectedTrack, err := showTrackOptions(trackSelection)
	if err != nil {
		return err
	}

	// write output to json
	toWrite, _ := json.Marshal(selectedTrack)
	fp, err := os.OpenFile(fmt.Sprintf("%s/jam.json", site.BasePath), os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0755)
	if err != nil {
		return err
	}
	fp.WriteString(string(toWrite))

	if buildErr := BuildSite(site, false, false); err != nil {
		return buildErr
	}

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

func showTrackOptions(tracks []Track) (Track, error) {
	prompt := promptui.Select{
		Label: "Select Track",
		Items: tracks,
		Templates: &promptui.SelectTemplates{
			Active:   `{{ .Name | cyan }} - {{ .ArtistName | cyan }}`,
			Inactive: `{{ .Name }} - {{ .ArtistName }}`,
		},
	}

	resultIndex, _, err := prompt.Run()
	if err != nil {
		return Track{}, err
	}

	return tracks[resultIndex], nil
}
