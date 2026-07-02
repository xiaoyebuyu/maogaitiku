/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "Microsoft YaHei",
          "PingFang SC",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
