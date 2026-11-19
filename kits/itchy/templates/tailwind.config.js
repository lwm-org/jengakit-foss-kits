/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        itchy: {
          primary: "#6B46C1", // Purple
          secondary: "#F6E05E", // Yellow
          accent: "#ED8936", // Orange
          stage: "#FFFFFF",
          workspace: "#F7FAFC",
        }
      }
    },
  },
  plugins: [],
}
