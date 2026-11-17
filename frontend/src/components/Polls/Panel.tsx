import React from "react";

interface PanelProps {
  name: string;
  description: string;
  children: JSX.Element;
}

const Panel = (props: PanelProps) => {
  return (
    <div className="polls-container">
      <h2 className="title-small">{props.name}</h2>
      <p className="text-normal">{props.description}</p>

      <div className="votes-wrapper">{props.children}</div>
    </div>
  );
};

export default Panel;
