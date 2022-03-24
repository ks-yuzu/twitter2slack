app             := dist/index.js
dockerfile      := Dockerfile
tag             := $$(basename $$(pwd))
image_timestamp := .docker-build-timestamps/$(dockerfile)

.PHONY: app image
.DEFAULT_GOAL := app

app: node_modules $(app)
image: app $(image_timestamp)

node_modules: package.json
	npm i && touch node_modules

$(app): src/index.ts package.json
	tsc --build tsconfig.json && chmod +x dist/index.js

$(image_timestamp): $(app) $(dockerfile)
	docker build . -f $(dockerfile) -t $(tag) --no-cache
	mkdir -p .docker-build-timestamps
	touch .docker-build-timestamps/$(dockerfile)
