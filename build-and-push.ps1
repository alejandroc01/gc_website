$ErrorActionPreference = "Stop"

docker build -f BackEnd/Dockerfile -t container.cs.vt.edu/natalie22/gc_website/backend:latest ./BackEnd
docker push container.cs.vt.edu/natalie22/gc_website/backend:latest

docker build -f FrontEnd/Dockerfile -t container.cs.vt.edu/natalie22/gc_website/frontend:latest ./FrontEnd
docker push container.cs.vt.edu/natalie22/gc_website/frontend:latest