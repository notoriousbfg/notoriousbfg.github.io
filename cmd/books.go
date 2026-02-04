package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"
)

type CurrentBook struct {
	Title   string
	Image   string
	Authors []string
	Link    string
}

var hardCoverAPIKey = os.Getenv("HARDOVER_API_KEY")

type hardcoverResponse struct {
	Data struct {
		UserBooks []struct {
			Book struct {
				Title string `json:"title"`
				Image *struct {
					URL string `json:"url"`
				} `json:"image"`
				Contributions []struct {
					Author struct {
						Name string `json:"name"`
					} `json:"author"`
				} `json:"contributions"`
				Slug string `json:"slug"`
			} `json:"book"`
		} `json:"user_books"`
	} `json:"data"`
	Errors []struct {
		Message string `json:"message"`
	} `json:"errors"`
}

func GetCurrentHardcoverBook(ctx context.Context) (CurrentBook, error) {
	const maxAttempts = 3
	backoff := 200 * time.Millisecond

	var lastErr error

	for attempt := 1; attempt <= maxAttempts; attempt++ {
		book, err := fetchBook(ctx)
		if err == nil {
			return book, nil
		}
		lastErr = err

		if attempt < maxAttempts {
			select {
			case <-time.After(backoff):
				backoff *= 2
			case <-ctx.Done():
				return CurrentBook{}, ctx.Err()
			}
		}
	}

	return CurrentBook{}, fmt.Errorf("failed after %d attempts: %w", maxAttempts, lastErr)
}

func fetchBook(ctx context.Context) (CurrentBook, error) {
	query := `
query GetUserBooks($user_id: Int!) {
	user_books(where: {user_id: {_eq: $user_id}, status_id: {_eq: 2}}) {
		book {
			title
			image { url }
			contributions { author { name } }
			slug
		}
	}
}`

	payload := map[string]interface{}{
		"query": query,
		"variables": map[string]interface{}{
			"user_id": 50871,
		},
	}

	bodyBytes, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, "POST", "https://api.hardcover.app/v1/graphql", bytes.NewReader(bodyBytes))
	if err != nil {
		return CurrentBook{}, err
	}

	req.Header.Set("Authorization", "Bearer "+hardCoverAPIKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return CurrentBook{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return CurrentBook{}, fmt.Errorf("hardcover API returned status %d", resp.StatusCode)
	}

	var hcResp hardcoverResponse
	if err := json.NewDecoder(resp.Body).Decode(&hcResp); err != nil {
		return CurrentBook{}, fmt.Errorf("decode response: %w", err)
	}

	if len(hcResp.Errors) > 0 {
		return CurrentBook{}, fmt.Errorf("graphql error: %s", hcResp.Errors[0].Message)
	}

	if len(hcResp.Data.UserBooks) == 0 {
		return CurrentBook{}, nil
	}

	first := hcResp.Data.UserBooks[0].Book
	authors := make([]string, 0, len(first.Contributions))
	for _, c := range first.Contributions {
		authors = append(authors, c.Author.Name)
	}

	imageURL := ""
	if first.Image != nil {
		imageURL = first.Image.URL
	}

	return CurrentBook{
		Title:   first.Title,
		Image:   imageURL,
		Authors: authors,
		Link:    fmt.Sprintf("https://hardcover.app/books/%s", first.Slug),
	}, nil
}

func truncateText(s string, max int) string {
	if len(s) < max {
		return s
	}

	return fmt.Sprintf("%s...", s[:max])
}
