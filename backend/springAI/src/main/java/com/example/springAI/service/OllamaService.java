package com.example.springAI.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.Map;

@Service
public class OllamaService {

    private final RestClient restClient;

    @Value(
            "${pipeline.models.steps:qwen2.5:7b}"
    )
    private String model;

    public OllamaService() {

        this.restClient =
                RestClient.builder()
                        .baseUrl(
                                "http://localhost:11434"
                        )
                        .build();
    }

    public String generate(
            String prompt
    ) {

        Map<String, Object> request =
                Map.of(
                        "model",
                        model,

                        "prompt",
                        prompt,

                        "stream",
                        false,

                        "options",
                        Map.of(
                                "temperature",
                                0.1
                        )
                );

        Map<?, ?> response =
                restClient.post()
                        .uri("/api/generate")
                        .body(request)
                        .retrieve()
                        .body(
                                Map.class
                        );

        if (response == null) {

            throw new IllegalStateException(
                    "Ollama returned an empty response."
            );
        }

        Object result =
                response.get(
                        "response"
                );

        if (result == null) {

            throw new IllegalStateException(
                    "Ollama response did not contain generated text."
            );
        }

        return result.toString().trim();
    }
}