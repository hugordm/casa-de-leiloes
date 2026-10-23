# Imagem do front (usada pelo docker-compose.yml da raiz).
# O Vite "embute" o VITE_API_URL no build, por isso ele entra como argumento de build.
FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Endereço da API como o NAVEGADOR enxerga (porta publicada na máquina), não o nome do serviço.
ARG VITE_API_URL=http://localhost:3333
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

EXPOSE 5173
# vite preview serve o build e devolve o index.html nas rotas do React Router (F5 em /lotes/1 funciona).
CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "5173", "--strictPort"]
