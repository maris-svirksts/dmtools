package com.github.istin.dmtools.job;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertTrue;

class WorkflowInstallerRegressionTest {

    @Test
    void installStepsPassDmtoolsVersionExplicitlyWhenProvided() throws IOException {
        for (String workflow : versionAwareWorkflows()) {
            String content = readRepoFile(workflow);
            assertTrue(
                    content.contains("bash -s -- \"${DMTOOLS_VERSION}\""),
                    workflow + " must pass DMTOOLS_VERSION as an explicit install.sh argument"
            );
        }
    }

    @Test
    void installStepsKeepLatestDefaultWhenVersionIsUnset() throws IOException {
        for (String workflow : versionAwareWorkflows()) {
            String content = readRepoFile(workflow);
            assertTrue(
                    content.contains("DMTOOLS_VERSION is not set; installer will use latest."),
                    workflow + " must keep explicit latest-default messaging"
            );
            assertTrue(
                    content.contains("| bash"),
                    workflow + " must execute installer when DMTOOLS_VERSION is not set"
            );
        }
    }

    @Test
    void integrationFallbackInstallsAlsoPropagateDmtoolsVersion() throws IOException {
        List<String> workflowsWithFallback = List.of(
                ".github/workflows/integration-test-linux.yml",
                ".github/workflows/integration-test-macos.yml"
        );

        for (String workflow : workflowsWithFallback) {
            String content = readRepoFile(workflow);
            assertTrue(
                    content.contains("raw.githubusercontent.com/IstiN/dmtools/main/install.sh\" | bash -s -- \"${DMTOOLS_VERSION}\""),
                    workflow + " fallback install path must also pass DMTOOLS_VERSION explicitly"
            );
        }
    }

    @Test
    void installerUrlOverrideVariableIsWiredForVersionAwareWorkflows() throws IOException {
        for (String workflow : versionAwareWorkflows()) {
            String content = readRepoFile(workflow);
            assertTrue(
                    content.contains("DMTOOLS_INSTALL_URL"),
                    workflow + " must wire DMTOOLS_INSTALL_URL override"
            );
        }
    }

    private static List<String> versionAwareWorkflows() {
        return List.of(
                ".github/workflows/ai-teammate.yml",
                ".github/workflows/ai-teammate-ado.yml",
                ".github/workflows/integration-test-linux.yml",
                ".github/workflows/integration-test-macos.yml"
        );
    }

    private static String readRepoFile(String relativePath) throws IOException {
        Path repoRoot = findRepoRoot(Path.of("").toAbsolutePath());
        return Files.readString(repoRoot.resolve(relativePath));
    }

    private static Path findRepoRoot(Path start) {
        Path current = start;
        while (current != null) {
            if (Files.isDirectory(current.resolve(".github")) && Files.exists(current.resolve("settings.gradle"))) {
                return current;
            }
            current = current.getParent();
        }
        throw new IllegalStateException("Unable to locate repository root");
    }
}
