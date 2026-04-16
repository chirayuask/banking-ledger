.PHONY: dev start migrate-up migrate-down seed test-concurrency install

# Install dependencies
install:
	npm install
	cd frontend && npm install

# Development
dev:
	npm run dev

start:
	npm start

# Database
migrate-up:
	node src/db/migrate.js up

migrate-down:
	node src/db/migrate.js down

seed:
	node src/db/seed.js

# Testing
test-concurrency:
	bash scripts/concurrency_test.sh
