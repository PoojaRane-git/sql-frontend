# Build stage using Java 21
FROM maven:3.9-eclipse-temurin-21 AS build
COPY . .
RUN chmod +x mvnw
RUN ./mvnw clean package -DskipTests

# Run stage using Java 21 JRE
FROM eclipse-temurin:21-jre
COPY --from=build /target/*.jar app.jar
ENV PORT=8082
EXPOSE 8082
ENTRYPOINT ["java","-jar","app.jar"]
