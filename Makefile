PORT ?= 8000

.PHONY: serve test lint

serve:
	python3 -m http.server $(PORT)

test:
	npm test

lint:
	npm run lint
