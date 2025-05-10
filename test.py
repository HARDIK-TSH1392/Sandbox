import numpy as np
import pandas as pd
import requests
import time
import logging
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger(__name__)

# Constants
API_ENDPOINTS = [
    "http://httpbin.org/delay/1",  # 1 second delay
    "http://httpbin.org/status/200",  # Success
    "http://httpbin.org/status/404",  # Not found
    "http://httpbin.org/status/500",  # Server error
]
TIMEOUT = 3  # seconds
MAX_WORKERS = 4
DATASET_SIZE = 1000

class NetworkTester:
    """Test network resilience with concurrent requests and error handling"""
    
    def __init__(self, endpoints, timeout=3):
        self.endpoints = endpoints
        self.timeout = timeout
        self.results = {"success": 0, "error": 0, "timeout": 0}
        
    def fetch_url(self, url):
        start_time = time.time()
        try:
            logger.info(f"Requesting {url}")
            response = requests.get(url, timeout=self.timeout)
            elapsed = time.time() - start_time
            
            logger.info(f"Response from {url}: status={response.status_code}, time={elapsed:.2f}s")
            
            if response.status_code >= 400:
                self.results["error"] += 1
                return {"url": url, "status": "error", "code": response.status_code, "time": elapsed}
            else:
                self.results["success"] += 1
                return {"url": url, "status": "success", "code": response.status_code, "time": elapsed}
                
        except requests.exceptions.Timeout:
            elapsed = time.time() - start_time
            logger.warning(f"Timeout for {url} after {elapsed:.2f}s")
            self.results["timeout"] += 1
            return {"url": url, "status": "timeout", "time": elapsed}
            
        except Exception as e:
            elapsed = time.time() - start_time
            logger.error(f"Error for {url}: {str(e)}")
            self.results["error"] += 1
            return {"url": url, "status": "error", "error": str(e), "time": elapsed}
    
    def run_concurrent_tests(self):
        logger.info(f"Starting concurrent network tests with {len(self.endpoints)} endpoints")
        start_time = time.time()
        
        all_results = []
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            future_to_url = {executor.submit(self.fetch_url, url): url for url in self.endpoints}
            for future in as_completed(future_to_url):
                result = future.result()
                all_results.append(result)
        
        total_time = time.time() - start_time
        logger.info(f"All network tests completed in {total_time:.2f}s")
        logger.info(f"Results: {self.results}")
        
        return all_results

class DataProcessor:
    """Process data with pandas and numpy to simulate CPU load"""
    
    def __init__(self, size=1000):
        self.size = size
        
    def generate_data(self):
        logger.info(f"Generating dataset with {self.size} rows")
        start_time = time.time()
        
        # Generate random data
        np.random.seed(42)  # For reproducibility
        self.df = pd.DataFrame({
            'A': np.random.randn(self.size),
            'B': np.random.randn(self.size),
            'C': np.random.choice(['X', 'Y', 'Z'], self.size),
            'D': np.random.randint(0, 100, self.size)
        })
        
        elapsed = time.time() - start_time
        logger.info(f"Dataset generated in {elapsed:.2f}s")
        return self.df
        
    def process_data(self):
        if not hasattr(self, 'df'):
            self.generate_data()
            
        logger.info("Processing dataset...")
        start_time = time.time()
        
        # Perform various operations to simulate CPU load
        results = {
            'mean_A': self.df['A'].mean(),
            'mean_B': self.df['B'].mean(),
            'std_A': self.df['A'].std(),
            'std_B': self.df['B'].std(),
            'corr_AB': self.df['A'].corr(self.df['B']),
            'group_means': self.df.groupby('C').mean().to_dict(),
            'percentiles': {
                '25%': self.df['D'].quantile(0.25),
                '50%': self.df['D'].quantile(0.50),
                '75%': self.df['D'].quantile(0.75)
            }
        }
        
        # Simulate more CPU-intensive operations
        for _ in range(3):
            self.df['E'] = self.df['A'] * self.df['B'] / (self.df['D'] + 1)
            self.df['F'] = np.sqrt(np.abs(self.df['A']))
            self.df['G'] = self.df['E'].rolling(window=20).mean()
        
        elapsed = time.time() - start_time
        logger.info(f"Data processing completed in {elapsed:.2f}s")
        
        return results

def run_demo():
    """Run a comprehensive demo of the sandbox capabilities"""
    logger.info("=" * 50)
    logger.info("SANDBOX CAPABILITIES DEMO")
    logger.info("=" * 50)
    
    # 1. System information
    logger.info("\n[1] System Information:")
    try:
        import platform
        logger.info(f"Python version: {platform.python_version()}")
        logger.info(f"Platform: {platform.platform()}")
    except Exception as e:
        logger.error(f"Error getting system info: {e}")
    
    # 2. Data processing (CPU intensive)
    logger.info("\n[2] Data Processing Test:")
    processor = DataProcessor(size=DATASET_SIZE)
    data_results = processor.process_data()
    logger.info(f"Data statistics: mean_A={data_results['mean_A']:.4f}, mean_B={data_results['mean_B']:.4f}")
    logger.info(f"Correlation A-B: {data_results['corr_AB']:.4f}")
    
    # 3. Network resilience testing
    logger.info("\n[3] Network Resilience Test:")
    network_tester = NetworkTester(API_ENDPOINTS, timeout=TIMEOUT)
    network_results = network_tester.run_concurrent_tests()
    
    # 4. Summary
    logger.info("\n[4] Test Summary:")
    logger.info(f"Data processing: Processed {DATASET_SIZE} rows with multiple transformations")
    logger.info(f"Network testing: {len(network_results)} endpoints tested with {MAX_WORKERS} concurrent workers")
    logger.info(f"Network results: {network_tester.results}")
    
    logger.info("\nDemo completed successfully!")
    return {
        "data_results": data_results,
        "network_results": network_tester.results
    }

if __name__ == "__main__":
    try:
        run_demo()
    except Exception as e:
        logger.error(f"Demo failed with error: {e}")
        sys.exit(1)
