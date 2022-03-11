.PHONY: build
.DEFAULT_GOAL := build

build: node_modules dist/index.js

dist/index.js: src/index.ts package.json
	tsc --build tsconfig.json && chmod +x dist/index.js

node_modules: package.json
	npm i && touch node_modules
