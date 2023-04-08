import { useState, useEffect } from 'react';
import { DefaultLoadingManager } from 'three';

const CustomLoadingManager = () => {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const handleLoad = () => {
      setIsLoading(false);
    };

    DefaultLoadingManager.onLoad = handleLoad;

    return () => {
        DefaultLoadingManager.onLoad = () => {}; 
    };
  }, []);

  return isLoading;
};

export default CustomLoadingManager;