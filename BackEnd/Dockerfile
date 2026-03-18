#FROM OFFICIAL NODE.JS IMAGE 
FROM node:20-bookworm-slim

#INSIDE CONTAINER CREATE AND SWITCH TO APP DIR
WORKDIR /app

# COPY DEPENDENCY FILES (ENDS IN .JSON)
COPY package*.json ./

# INSTALL OCR DEPENDENCIES FOR COMPOSITE AUTO-DETECT
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        imagemagick \
        tesseract-ocr \
        tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

# INSTALL NODE DEPENDENCIES USNG CLEAN INSTALL
RUN npm ci

# COPY SOURCE CODE/ REST OF BACKEND INTO CONTAINER
COPY . .

# LISTEN ON PORT 3000
EXPOSE 3000

# START THE SERVER
CMD ["npm", "start"]
