printf(wipe out/name)
#include <stdio.h>
#include <stdlib.h>

void setLightMode() {
    printf("\033[0;37m"); // Set text color to white
    printf("\033[40m");   // Set background color to black
}

void setDarkMode() {
    printf("\033[0;30m"); // Set text color to black
    printf("\033[47m");   // Set background color to white
}

int main() {
    char input;

    while (1) {
        printf("Press 'd' for Dark Mode, 'l' for Light Mode, 'q' to quit: ");
        input = getchar();
        getchar(); // To consume the newline character

        if (input == 'd') {
            setDarkMode();
            printf("Dark Mode Activated\n");
        } else if (input == 'l') {
            setLightMode();
            printf("Light Mode Activated\n");
        } else if (input == 'q') {
            break;
        } else {
            printf("Invalid input\n");
        }
    }

    // Reset to default colors before exiting
    printf("\033[0m");

    return 0;
}