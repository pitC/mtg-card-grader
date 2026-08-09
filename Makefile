# ---- Configuration ----
BUCKET      := mtg-card-grader
REGION      := eu-central-1
FILE        := card-grader.html
ENDPOINT    := http://$(BUCKET).s3-website-$(REGION).amazonaws.com
URL         := http://mtg-card-grader.s3-website.eu-central-1.amazonaws.com

.PHONY: deploy open verify configure-hosting help

## Upload card-grader.html to the bucket (overwrites the existing copy)
deploy:
	aws s3 cp $(FILE) s3://$(BUCKET)/ --region $(REGION)
	@echo "Deployed to $(ENDPOINT)"

## Open the live site in your default browser
open:
	open "$(URL)"

## List what's currently in the bucket
verify:
	aws s3 ls s3://$(BUCKET)/ --region $(REGION)

## Deploy then open the site
release: deploy open

help:
	@echo "Targets:"
	@echo "  make deploy             - upload $(FILE) to s3://$(BUCKET)/"
	@echo "  make open               - open the site in your browser"
	@echo "  make verify             - list bucket contents"
	@echo "  make release            - deploy + open"