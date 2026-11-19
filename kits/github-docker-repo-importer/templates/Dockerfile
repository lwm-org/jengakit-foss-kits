# Two-stage git clone Dockerfile — github-docker-repo-importer fallback template
# Stage 1: clone the repository at build time
FROM alpine/git AS source
RUN git clone --depth=1 https://github.com/PLACEHOLDER/REPO /repo

# Stage 2: run the application (adapt base image and CMD to match repository technology)
FROM python:3.11-slim
WORKDIR /app
COPY --from=source /repo /app
EXPOSE 8080
CMD ["python", "app.py"]
