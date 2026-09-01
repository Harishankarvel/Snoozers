import numpy as np

class ProjectionMap:
    """
    Handles Inverse Perspective Mapping (IPM) to project 2D image coordinates 
    (from bounding boxes) into a 3D egocentric coordinate space.
    """
    def __init__(self, camera_matrix: np.ndarray = None, dist_coeffs: np.ndarray = None):
        """
        In a real system, provide actual intrinsic matrices from camera calibration.
        """
        self.camera_matrix = camera_matrix if camera_matrix is not None else np.eye(3)
        self.dist_coeffs = dist_coeffs if dist_coeffs is not None else np.zeros(5)

    def project_to_3d(self, bbox2d: list) -> dict:
        """
        Projects a 2D bounding box to an estimated 3D position (x, y, z).
        Assumes a flat ground plane constraint for monocular depth estimation.
        
        Args:
            bbox2d: [xmin, ymin, xmax, ymax]
            
        Returns:
            dict containing x, y, z coordinates relative to the ego vehicle.
        """
        # Mock projection logic
        # Typically you'd take the bottom center of the bbox:
        # bottom_center = ((xmin + xmax) / 2, ymax)
        # Apply cv2.undistortPoints and then intersect with ground plane Z=0
        
        x_min, y_min, x_max, y_max = bbox2d
        bottom_center_x = (x_min + x_max) / 2
        
        # Simple placeholder mapping
        z_distance = 1000 / max(1, (y_max - y_min)) # larger box = closer (smaller z)
        x_lateral = (bottom_center_x - 320) * 0.1 # assuming 640 width center
        
        return {
            "x": round(x_lateral, 2),
            "y": 0.0, # ground plane
            "z": round(z_distance, 2)
        }
