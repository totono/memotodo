package todo

import "testing"

func TestParseLinks(t *testing.T) {
	text := `見て <b>https://example.com/path</b> と \\server\share\file.txt と C:\Users\me\doc.txt`
	links := ParseLinks(text)
	if len(links) != 3 {
		t.Fatalf("expected 3 links, got %d: %+v", len(links), links)
	}
	if links[0].Type != "url" || links[0].Value != "https://example.com/path" {
		t.Errorf("unexpected first link: %+v", links[0])
	}
	if links[1].Type != "path" || links[1].Value != `\\server\share\file.txt` {
		t.Errorf("unexpected second link: %+v", links[1])
	}
	if links[2].Type != "path" || links[2].Value != `C:\Users\me\doc.txt` {
		t.Errorf("unexpected third link: %+v", links[2])
	}
}

func TestParseLinksDedup(t *testing.T) {
	links := ParseLinks("https://a.com https://a.com")
	if len(links) != 1 {
		t.Fatalf("expected dedup to 1 link, got %d", len(links))
	}
}
