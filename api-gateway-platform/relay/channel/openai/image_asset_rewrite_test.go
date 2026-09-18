package openai

import "testing"

func TestImageAssetIDFromContentPath(t *testing.T) {
	valid := []struct {
		path string
		want string
	}{
		{"/v1/images/90e0eba5-3bc3-419b-9288-9550e2bab218/content", "90e0eba5-3bc3-419b-9288-9550e2bab218"},
		{"/v1/images/abc/content", "abc"},
	}
	for _, tc := range valid {
		if got := imageAssetIDFromContentPath(tc.path); got != tc.want {
			t.Errorf("imageAssetIDFromContentPath(%q) = %q, want %q", tc.path, got, tc.want)
		}
	}

	invalid := []string{
		"",
		"/v1/images//content",              // empty id
		"/v1/images/abc",                   // no /content suffix
		"/v1/images/abc/content/extra",     // trailing segment
		"/v2/images/abc/content",           // wrong prefix
		"/v1/images/a/b/content",           // nested slash in id
		"/v1/images/content",               // id would be empty after trim
		"https://host/v1/images/x/content", // absolute, handled elsewhere
	}
	for _, path := range invalid {
		if got := imageAssetIDFromContentPath(path); got != "" {
			t.Errorf("imageAssetIDFromContentPath(%q) = %q, want empty", path, got)
		}
	}
}

func TestContainsSlash(t *testing.T) {
	if containsSlash("abc") {
		t.Error("containsSlash(abc) = true, want false")
	}
	if !containsSlash("a/b") {
		t.Error("containsSlash(a/b) = false, want true")
	}
	if !containsSlash("/") {
		t.Error("containsSlash(/) = false, want true")
	}
}