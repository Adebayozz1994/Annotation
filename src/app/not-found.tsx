import Link from "next/link";

export default function NotFound() {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-100">
        <h1 className="text-6xl font-bold text-red-600">404</h1>
        <p className="text-xl mt-4 text-gray-600">Oops! Page not found....</p>
        <Link
          href="/"
          className="mt-6 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-700 transition"
        >
          Go Home
        </Link>
      </div>
    );
  }
  