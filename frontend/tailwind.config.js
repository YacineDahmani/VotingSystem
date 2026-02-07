/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                slate: {
                    950: '#020617', // Main background (Deep Navy)
                    900: '#0f172a', // Sidebar/Panel bg (Navy-Slate)
                    800: '#1e293b', // Card bg (Steel-Slate)
                    700: '#334155', // Borders (Crisp)
                    400: '#94a3b8', // Muted text
                },
                emerald: {
                    400: '#34d399',
                    500: '#10b981', // Success/Active
                },
                sky: {
                    400: '#38bdf8',
                    500: '#0ea5e9', // Primary Action
                    600: '#0284c7', // Hover
                }
            }
        },
    },
    plugins: [
        require("tailwindcss-animate")
    ],
}
