import React from "react"

import { IconProps } from "types/icon"

const Wallet: React.FC<IconProps> = ({
  size = "20",
  color = "currentColor",
  ...attributes
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...attributes}
    >
      <path
        d="M2.5 6.5C2.5 5.67157 3.17157 5 4 5H16C16.8284 5 17.5 5.67157 17.5 6.5V15.5C17.5 16.3284 16.8284 17 16 17H4C3.17157 17 2.5 16.3284 2.5 15.5V6.5Z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.5 7.5H17.5"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M5 3.5L13 5"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="14" cy="12.5" r="1.2" fill={color} />
    </svg>
  )
}

export default Wallet