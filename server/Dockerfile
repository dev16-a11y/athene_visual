FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

COPY NuGet.Config ./
COPY Smarttwin.Api/Smarttwin.Api.csproj Smarttwin.Api/
RUN dotnet restore Smarttwin.Api/Smarttwin.Api.csproj \
    --configfile NuGet.Config \
    -p:NuGetAudit=false

COPY Smarttwin.Api/ Smarttwin.Api/
RUN dotnet publish Smarttwin.Api/Smarttwin.Api.csproj \
    -c Release \
    -o /app/publish \
    --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish ./
ENV ASPNETCORE_URLS=http://0.0.0.0:5080
ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 5080
ENTRYPOINT ["dotnet", "Smarttwin.Api.dll"]
