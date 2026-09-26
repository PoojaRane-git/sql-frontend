    package com.example.springAI.service;

    import org.springframework.ai.chat.model.ChatResponse;
    import org.springframework.ai.chat.prompt.Prompt;
    import org.springframework.ai.ollama.OllamaChatModel;
    import org.springframework.ai.ollama.api.OllamaChatOptions;
    import org.springframework.beans.factory.annotation.Value;
    import org.springframework.stereotype.Service;

    import java.util.List;
    import java.util.Map;

    @Service
    public class SQLExecutionService {

        @Value("${pipeline.models.steps:qwen2.5-coder:7b}")
        private String stepsModel;

        @Value("${pipeline.models.sample-data:qwen2.5:3b}")
        private String sampleDataModel;

        @Value("${pipeline.models.syntax-check:qwen2.5-coder:7b}")
        private String syntaxCheckModel;

        private final OllamaChatModel chatModel;

        public SQLExecutionService(OllamaChatModel chatModel) {
            this.chatModel = chatModel;
        }

        private String callWithModel(String promptText, String model) {
            OllamaChatOptions options = OllamaChatOptions.builder()
                    .model(model)
                    .build();

            ChatResponse response = chatModel.call(new Prompt(promptText, options));
            String text = response.getResult().getOutput().getText();
            if (text == null) {
                throw new IllegalStateException("Model '" + model + "' returned no text output for this prompt.");
            }
            return text;
        }

        /**
         * Full logical execution-order analysis, run on the steps model from application.yml.
         */
        //analyzeSQL
        public String analyzeSQL(String query) {
            String prompt = PromptBuilder.buildStepsPrompt(query);
            System.out.println("prompt: " + prompt);
            return callWithModel(prompt, stepsModel);
        }

        /**
         * Raw sample rows, run on the sample-data model from application.yml.
         */
        public String generateSampleData(String query, Map<String, List<String>> requiredColumnsByTable) {
            String prompt = PromptBuilder.buildSampleDataPrompt(query, requiredColumnsByTable);
            return callWithModel(prompt, sampleDataModel);
        }

        /** Corrective pass over a candidate steps-JSON. Runs on the steps model. */
        public String validateSteps(String candidateJson, String query) {
            String prompt = PromptBuilder.buildValidationPrompt(candidateJson, query);
            return callWithModel(prompt, stepsModel);
        }

        /** Explains a SQL syntax error in plain language. Runs on the syntax-check model. */
        public String explainSyntaxError(String query, String dbErrorMessage) {
            String prompt = PromptBuilder.buildSyntaxErrorPrompt(query, dbErrorMessage);
            return callWithModel(prompt, syntaxCheckModel);
        }
    }