import { SignUp } from "@clerk/clerk-react";
import { useContext, useState } from "react";
import { AppContext } from "../app-context.tsx";

const slides = [
  { text: "This is going to be the way to\u00A0make apps.", author: "Boorad / Brad Anderson", role: "startup founder" },
  { text: "Fastest I've ever developed any app of any kind.", author: "Mykle Hansen", role: "developer" },
];

export async function signupLoader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const nextUrl = url.searchParams.get("next_url") || "/";
  return nextUrl;
}

export function SignUpPage() {
  const [emailOptIn, setEmailOptIn] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const isDarkMode = useContext(AppContext).sideBar.isDarkMode;

  function incSlide() {
    setActiveSlide((cur) => (cur === slides.length - 1 ? 0 : ++cur));
  }

  function decSlide() {
    setActiveSlide((cur) => (cur === 0 ? slides.length - 1 : --cur));
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] min-h-screen overflow-hidden">
      <div className="relative lg:min-h-screen order-2 lg:order-1">
        <div className="relative flex justify-center flex-col p-10 sm:p-14 lg:p-20 z-10 h-full z-1">
          <div className="flex flex-col gap-10 sm:gap-16 mt-4 sm:mt-[30px]">
            {slides.map((slide, i) => (
              <Slide key={i} data={slide} isDarkMode={isDarkMode} />
            ))}
          </div>
        </div>
        <img
          className="absolute top-0 bottom-0 right-0 left-0 w-full h-full object-cover z-0"
          src={isDarkMode ? "/login-bg-dark.png" : "/login-bg-light.png"}
        />
      </div>

      <div className="flex items-center justify-center h-full order-1 lg:order-2">
        <div
          className={`relative max-w-[445px] p-10 sm:px-[48px] sm:py-[60px] mx-10 my-20 sm:m-14 sm:ml-6 grow-0 rounded-fp-l ${isDarkMode ? "bg-fp-bg-01" : ""}`}
        >
          <svg
            className="max-w-36 sm:max-w-max"
            width="135"
            height="51"
            viewBox="0 0 191 51"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              fill="black"
              fillRule="evenodd"
              clipRule="evenodd"
              d="M64.8818 44.0241V34.281H74.4006V30.8976H64.8818V26.0134C64.8818 25.7081 64.8818 25.352 65.1482 25.0976C65.3904 24.8177 65.6326 24.8432 65.8991 24.8432H77.9368V21.4598H63.9372C63.2106 21.4598 62.3628 21.5361 61.6362 22.2738C60.9822 22.9098 60.8369 23.7239 60.8369 24.4362V44.0241H64.8818ZM79.8261 44.0241H83.4108V26.9292H79.8261V44.0241ZM83.4108 24.4616V21.4598H79.8261V24.4616H83.4108ZM86.3899 44.0241H89.9988V34.3828C89.9988 33.0854 90.1442 31.9152 90.8224 31.0248C91.6701 29.9818 92.9296 29.8292 93.8742 29.8292H95.4001V26.9292H92.9538C91.6943 26.9292 89.5871 27.0309 88.0854 28.4301C86.7048 29.6766 86.3899 31.5082 86.3899 33.3907V44.0241ZM111.87 44.0241V41.1241H103.926C102.618 41.1241 101.116 40.9206 100.656 39.089C100.535 38.5802 100.438 37.4863 100.438 36.7486H109.884C110.538 36.7486 111.144 36.6214 111.628 36.0872C112.306 35.3749 112.403 34.3828 112.403 33.5179C112.403 31.3555 112.016 29.2187 110.102 27.9722C108.6 26.98 106.639 26.8783 104.725 26.8783C103.199 26.8783 100.438 26.8783 98.6457 28.4809C96.8776 30.109 96.708 32.4494 96.708 35.6547C96.708 37.8934 96.8049 40.2592 97.8948 41.8618C99.227 43.8715 101.189 44.0241 102.86 44.0241H111.87ZM100.438 33.8486C100.462 32.7038 100.438 31.788 101.165 30.8976C102.158 29.7529 103.635 29.7783 104.58 29.7783C105.597 29.7783 106.76 29.8292 107.656 30.5415C108.164 30.974 108.697 31.788 108.697 32.831C108.697 33.2889 108.6 33.8486 107.898 33.8486H100.438ZM118.555 44.0241H123.085C124.756 44.0241 127.275 43.8969 128.801 41.582C129.963 39.8267 130.084 37.3846 130.084 35.1205C130.084 33.2635 130.036 30.6178 128.365 28.8117C126.815 27.1072 124.635 26.9292 123.593 26.9292H117.901C117.296 26.9292 116.496 27.0055 115.891 27.4888C115.479 27.8195 114.971 28.4555 114.971 29.5748V49.519H118.555V44.0241ZM118.555 41.1241V30.6433C118.555 30.4652 118.604 30.2617 118.797 30.0582C118.919 29.9818 119.137 29.8292 119.282 29.8292H122.818C124.417 29.8292 125.482 30.6687 125.943 31.788C126.136 32.2205 126.379 33.1363 126.379 35.4512C126.379 37.9951 126.039 39.0381 125.7 39.5469C125.313 40.2337 124.417 41.1241 122.624 41.1241H118.555ZM132.652 44.0241H136.236V34.3828C136.236 33.0854 136.406 31.9152 137.06 31.0248C137.932 29.9818 139.191 29.8292 140.136 29.8292H141.638V26.9292H139.216C137.956 26.9292 135.849 27.0309 134.347 28.4301C132.967 29.6766 132.652 31.5082 132.652 33.3907V44.0241ZM151.011 26.7511C149.074 26.7511 146.215 26.802 144.447 28.5573C142.582 30.3889 142.364 33.6196 142.364 35.553C142.364 37.2828 142.51 40.5136 144.447 42.3706C146.215 44.1005 149.074 44.2277 151.011 44.2277C152.876 44.2277 155.831 44.1005 157.575 42.3706C158.786 41.2004 159.682 39.0381 159.682 35.4258C159.682 33.6196 159.464 30.3889 157.575 28.5573C155.807 26.802 152.949 26.7511 151.011 26.7511ZM146.07 35.5275C146.07 34.4082 146.07 32.2205 147.087 30.9994C148.105 29.7783 149.849 29.6511 151.011 29.6511C152.295 29.6511 153.869 29.7783 154.911 30.9994C156.049 32.3222 155.952 34.2556 155.952 35.5275C155.952 37.003 155.952 38.6311 154.887 39.903C153.797 41.1495 152.368 41.3276 151.011 41.3276C149.728 41.3276 148.153 41.1495 147.112 39.903C146.094 38.682 146.07 36.9267 146.07 35.5275ZM170.461 26.7511C168.523 26.7511 165.665 26.802 163.872 28.5573C162.007 30.3889 161.79 33.6196 161.79 35.553C161.79 37.2828 161.959 40.5136 163.872 42.3706C165.665 44.1005 168.523 44.2277 170.461 44.2277C172.326 44.2277 175.281 44.1005 177.024 42.3706C178.211 41.2004 179.107 39.0381 179.107 35.4258C179.107 33.6196 178.889 30.3889 177.024 28.5573C175.232 26.802 172.398 26.7511 170.461 26.7511ZM165.52 35.5275C165.52 34.4082 165.52 32.2205 166.513 30.9994C167.53 29.7783 169.298 29.6511 170.461 29.6511C171.744 29.6511 173.319 29.7783 174.36 30.9994C175.499 32.3222 175.402 34.2556 175.402 35.5275C175.402 37.003 175.402 38.6311 174.312 39.903C173.246 41.1495 171.793 41.3276 170.461 41.3276C169.153 41.3276 167.603 41.1495 166.561 39.903C165.544 38.682 165.52 36.9267 165.52 35.5275ZM186.543 44.0241V29.8292H191V26.9292H186.543C186.519 25.5555 187.003 24.8432 187.464 24.5125C188.118 24.08 189.159 24.0037 191 24.0037V21.2308C189.159 21.18 186.18 21.3326 184.654 22.6554C183.273 23.8511 182.983 25.8353 182.959 26.98H180.682V29.8292H182.959V44.0241H186.543Z"
            />
            <path
              fill="currentColor"
              className="text-fp-a-02"
              fillRule="evenodd"
              clipRule="evenodd"
              d="M29.4063 12.7461H14.6912L7.35742 25.4675H22.0488L29.4063 12.7461Z"
            />
            <path
              fill="currentColor"
              className="text-fp-a-03"
              fillRule="evenodd"
              clipRule="evenodd"
              d="M14.6914 12.7471H21.8591H29.4065C29.4065 7.31203 26.4397 2.54149 22.0489 0.00195312L14.6914 12.7471Z"
            />
            <path
              fill="currentColor"
              className="text-fp-a-01"
              fillRule="evenodd"
              clipRule="evenodd"
              d="M22.0489 25.4663H7.35754C7.33381 25.4663 7.33381 25.4663 7.33381 25.4663L0 38.2115H14.6914L22.0489 25.4663ZM29.4064 38.2115H44.0978C44.0978 32.7764 41.1548 28.0058 36.764 25.4663H36.7402L29.4064 38.2115Z"
            />
            <path
              fill="currentColor"
              className="text-fp-a-00"
              fillRule="evenodd"
              clipRule="evenodd"
              d="M14.6914 38.2124H0L7.35754 50.9338H22.0489C17.6581 48.3943 14.6914 43.6475 14.6914 38.2124ZM44.0978 38.2124H29.4064L22.0489 50.9338H36.7402L44.0978 38.2124Z"
            />
          </svg>
          <h1 className="text-[6.5vw] font-bold xs:text-34 mb-[30px] sm:mb-[46px] mt-[16px] tracking-[0.02em] leading-[1.3]">
            Create your account
          </h1>
          <h2 className="text-11 text-fp-dec-02 mb-4">Email preferences</h2>
          <p className="text-14 sm:text-16 max-w-[90%] mb-4 text-balance">
            <b>Would you like to receive emails from us?</b>
          </p>
          <div className="flex items-start gap-2 mb-[48px] sm:mb-[68px]">
            <input
              type="checkbox"
              id="emailOptIn"
              checked={emailOptIn}
              onChange={(e) => setEmailOptIn(e.target.checked)}
              className="w-[18px] h-[18px] cursor-pointer mt-[3px] accent-fp-a-02"
            />
            <label htmlFor="emailOptIn" className="text-14 sm:text-16 text-fp-s cursor-pointer hover:text-fp-p">
              Yes, I'd like to receive (occasional, genuinely informative) emails from Fireproof.
            </label>
          </div>
          <SignUp
            appearance={{
              elements: {
                headerSubtitle: { display: "none" },
                footer: { display: "none" },
              },
            }}
            unsafeMetadata={{
              gclid: new URLSearchParams(window.location.search).get("gclid"),
              emailOptIn: emailOptIn,
            }}
          />
          <ExtraCTA />
        </div>
      </div>
    </div>
  );
}

function ExtraCTA() {
  return (
    <div className="hidden md:block">
      <svg
        className="absolute scale-[0.7] sm:scale-100 right-[-68px] bottom-[60px] sm:right-[-60px] sm:bottom-[95px] text-fp-a-02 pointer-events-none"
        width="187"
        height="186"
        viewBox="0 0 187 186"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          className="animate-stroke-dash-500"
          d="M44.0833 175.38C119.188 155.145 160.007 78.4817 142.027 1.9999"
          stroke="currentColor"
          strokeWidth="4"
          strokeDasharray="500"
          strokeDashoffset="-500"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <path
          className="animate-stroke-dash-500"
          d="M59.8737 159.466L44.0832 175.38L67.7991 178.707"
          stroke="currentColor"
          strokeWidth="4"
          strokeDasharray="500"
          strokeDashoffset="-500"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="absolute scale-[0.85] sm:scale-100 right-[-75px] bottom-[210px] sm:right-[-86px] sm:bottom-[285px]">
        <p className="animate-show absolute max-w-[120px] top-[16px] left-[18px] text-center text-[14px] font-bold text-fp-a-02 leading-[1.3] tracking-[-0.04em] rotate-[-11deg]">
          Sign in to see your data live!
        </p>
        <svg
          className="text-fp-a-02"
          width="161"
          height="67"
          viewBox="0 0 161 67"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            className="animate-stroke-dash-2000"
            stroke="currentColor"
            strokeWidth="1"
            strokeDasharray="2000"
            strokeDashoffset="-2000"
            vectorEffect="non-scaling-stroke"
            d="M73.7212 1C36.2218 13 4.22102 24.001 1.2211 44.501C-3.29427 75.3568 62.2205 69.2017 118.221 50.0015C169.722 32.3441 167.379 13.6053 146.721 7.50098C124.721 1 97.2212 4.00098 62.2205 13.0015"
          />
        </svg>
      </div>
    </div>
  )
}

function Slide({ data, isDarkMode }: { data: { text: string; author: string; role: string }; isDarkMode: boolean }) {
  return (
    <div className="flex flex-col text-white">
      <p className="text-[20px] sm:text-[34px] lg:text-[2vw] text-main font-bold text-balance mb-4 leading-[1.3]">"{data.text}"</p>
      <div className="">
        <p className="text-14-bold sm:text-16">
          <b>– {data.author}</b>
        </p>
        <p className={`text-14 ${isDarkMode ? "text-fp-dec-02" : "text-fp-dec-01"}`}>{data.role}</p>
      </div>
    </div>
  );
}
