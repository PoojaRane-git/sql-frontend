# Build stage
FROM maven:3.9-eclipse-temurin-17 AS build
COPY . .
RUN ./mvnw clean package -DskipTests

# Package stage
FROM eclipse-temurin:17-jre
COPY --from=build /target/*.jar app.jar
ENV PORT=8082
EXPOSE 8082
ENTRYPOINT ["java","-jar","app.jar"]
