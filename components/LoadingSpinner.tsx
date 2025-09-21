
import React from 'react';

const LoadingSpinner: React.FC = () => {
  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden shadow-lg animate-pulse">
      <div className="bg-gray-700 w-full aspect-video"></div>
      <div className="p-4">
        <div className="h-4 bg-gray-700 rounded w-3/4 mb-4"></div>
        <div className="flex items-center space-x-2 mt-6">
            <div className="w-8 h-8 rounded-full bg-gray-700"></div>
            <div className="flex-1 space-y-2">
                <div className="h-3 bg-gray-700 rounded w-1/2"></div>
                <div className="h-3 bg-gray-700 rounded w-1/4"></div>
            </div>
        </div>
         <div className="flex justify-between items-center mt-4">
            <div className="h-3 bg-gray-700 rounded w-1/5"></div>
            <div className="h-3 bg-gray-700 rounded w-1/5"></div>
            <div className="h-3 bg-gray-700 rounded w-1/4"></div>
        </div>
      </div>
    </div>
  );
};

export default LoadingSpinner;
