package com.github.istin.dmtools.job;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JobRunnerHelpTest {

    private PrintStream originalOut;

    @BeforeEach
    void captureStdout() {
        originalOut = System.out;
    }

    @AfterEach
    void restoreStdout() {
        System.setOut(originalOut);
    }

    @Test
    void helpOutputIncludesInstallCommandAndDmtoolsInstallUrl() throws Exception {
        ByteArrayOutputStream captured = new ByteArrayOutputStream();
        System.setOut(new PrintStream(captured));

        JobRunner.main(new String[]{"--help"});

        String output = captured.toString();
        assertNotNull(output);
        assertTrue(
                output.contains("raw.githubusercontent.com/IstiN/dmtools/main/install.sh"),
                "Help output should include the default install.sh URL"
        );
        assertTrue(
                output.contains("DMTOOLS_INSTALL_URL"),
                "Help output should mention DMTOOLS_INSTALL_URL override"
        );
    }
}
