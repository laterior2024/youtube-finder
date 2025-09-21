
import React, { useState, useEffect } from 'react';
import type { UserRole } from '../types';

interface LoginScreenProps {
  onLoginSuccess: (role: UserRole) => void;
}

// Default passwords, used only if nothing is set in localStorage
const DEFAULT_ADMIN_PASSWORD = '256008';
const DEFAULT_GUEST_PASSWORD = '123456';

// Keys for localStorage
const ADMIN_PASSWORD_KEY = 'adminPassword';
const GUEST_ACCOUNTS_KEY = 'guestAccounts';

interface GuestAccount {
  id: string;
  name: string;
  pass: string;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  
  useEffect(() => {
    try {
      const savedUsername = localStorage.getItem('savedUsername');
      if (savedUsername) {
        const savedPassword = localStorage.getItem('savedPassword');
        setUsername(savedUsername);
        if (savedPassword) {
          setPassword(savedPassword);
        }
        setRememberMe(true);
      }
    } catch (e) {
      console.error("localStorage에서 로그인 정보를 읽어오는 데 실패했습니다:", e);
    }
  }, []);


  const getAdminPassword = () => localStorage.getItem(ADMIN_PASSWORD_KEY) || DEFAULT_ADMIN_PASSWORD;
  
  const getGuestAccounts = (): GuestAccount[] => {
    try {
      const storedGuests = localStorage.getItem(GUEST_ACCOUNTS_KEY);
      if (storedGuests) {
        return JSON.parse(storedGuests);
      }
    } catch (e) {
      console.error("Failed to parse guest accounts from localStorage", e);
    }
    // Fallback to a single default guest if no multi-guest accounts are set up
    return [{ id: 'default_guest', name: 'guest', pass: localStorage.getItem('guestPassword') || DEFAULT_GUEST_PASSWORD }];
  };


  const handleLoginSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    setTimeout(() => {
      const enteredUsername = username.trim();
      const enteredPassword = password.trim();
      
      let loginSuccess = false;
      let userRole: UserRole | null = null;

      // 1. Check for Admin Login
      if (enteredUsername.toLowerCase() === 'laterior' && enteredPassword === getAdminPassword()) {
          loginSuccess = true;
          userRole = 'admin';
      } else {
        // 2. Check for Guest Login
        const guestAccounts = getGuestAccounts();
        const matchedGuest = guestAccounts.find(
          acc => acc.name === enteredUsername && acc.pass === enteredPassword
        );
        if (matchedGuest) {
            loginSuccess = true;
            userRole = 'guest';
        }
      }

      if (loginSuccess && userRole) {
        try {
            if (rememberMe) {
                localStorage.setItem('savedUsername', enteredUsername);
                localStorage.setItem('savedPassword', enteredPassword);
            } else {
                localStorage.removeItem('savedUsername');
                localStorage.removeItem('savedPassword');
            }
        } catch (err) {
            console.error("localStorage에 접근하는 중 오류 발생:", err);
        }
        onLoginSuccess(userRole);
      } else {
        setError('아이디 또는 비밀번호가 올바르지 않습니다.');
        setPassword('');
        setIsLoading(false);
      }
    }, 500);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight whitespace-nowrap">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-red-500 to-red-600">YouTube</span> 영상 파인더
          </h1>
          <p className="mt-2 text-lg text-gray-400">
            접근하려면 인증이 필요합니다.
          </p>
        </div>

        <form 
            onSubmit={handleLoginSubmit}
            className="bg-gray-800 p-8 rounded-lg shadow-2xl space-y-6"
        >
          <div>
             <label htmlFor="username" className="block text-sm font-medium text-gray-300 mb-2">
              아이디
            </label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-red-500 transition"
              placeholder="아이디를 입력하세요"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
              비밀번호
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-red-500 transition"
              placeholder="비밀번호를 입력하세요"
            />
          </div>
          
          <div className="flex items-center">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-500 bg-gray-700 rounded"
              />
              <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-300 cursor-pointer">
                로그인 정보 저장
              </label>
            </div>

          {error && (
            <p className="text-sm text-red-400 text-center -mt-2">{error}</p>
          )}

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center items-center bg-red-600 hover:bg-red-700 disabled:bg-red-900/50 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg shadow-lg transition-all duration-300 ease-in-out transform hover:scale-105"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  확인 중...
                </>
              ) : '로그인'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginScreen;
