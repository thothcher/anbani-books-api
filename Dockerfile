# Anbani BooksAPI — the API, the developer portal (/), the docs (/docs) and the reference website (/app) in one container.
#   docker compose up -d --build        (see docker-compose.yml)
# Everything that changes at runtime (SQLite database, uploads, generated JWT secret) lives in /data — mount a volume there.

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY src/BooksApi/BooksApi.csproj src/BooksApi/
RUN dotnet restore src/BooksApi/BooksApi.csproj
COPY src/BooksApi/ src/BooksApi/
RUN dotnet publish src/BooksApi/BooksApi.csproj -c Release -o /out --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /out ./api
COPY web ./web
COPY docs ./docs
RUN mkdir -p /data && chown $APP_UID /data

ENV Storage__Root=/data \
    Hosting__WebAppPath=/app/web \
    Hosting__DocsPath=/app/docs
VOLUME /data
EXPOSE 8080

USER $APP_UID
WORKDIR /app/api
ENTRYPOINT ["dotnet", "BooksApi.dll"]
