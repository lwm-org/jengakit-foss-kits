const React = require("react");

exports.onRenderBody = ({ setHtmlAttributes, setHeadComponents }) => {
  setHtmlAttributes({ lang: "en" });
  setHeadComponents([
    React.createElement("link", { key: "icon", rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }),
  ]);
};
