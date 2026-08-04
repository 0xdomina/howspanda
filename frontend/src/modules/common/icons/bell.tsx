import React from "react"

import { IconProps } from "types/icon"

const Bell: React.FC<IconProps> = ({
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
        d="M10 2.5C7.5 2.5 5.75 4.25 5.75 6.75V9.5C5.75 11 5.25 12 4.25 13L3.75 13.75H16.25L15.75 13C14.75 12 14.25 11 14.25 9.5V6.75C14.25 4.25 12.5 2.5 10 2.5Z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.5 15.5C8.75 16.25 9.25 16.75 10 16.75C10.75 16.75 11.25 16.25 11.5 15.5"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default Bell
