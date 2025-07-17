// CKBoost-specific cell collector using ckb_deterministic library
use crate::error::Error;
pub use ckb_deterministic::cell_classifier::{
    CellClass, CellCollector, CellInfo, RuleBasedClassifier, ClassificationRule
};
use ckb_deterministic::known_scripts::KnownScript;
use ckb_deterministic::cell_classifier::{create_universal_classifier, add_simple_ckb_rule};
use ckb_std::ckb_constants::Source;
use alloc::vec::Vec;


/// CKBoost-specific cell classifications
/// Known cells: UDT, Spore, simple CKB cell
/// Custom cells: Protocol, Campaign, User
#[derive(Debug, Clone, PartialEq)]
pub enum CKBoostCellClass {
    // Known CKB cell types
    Udt,
    Spore,
    SimpleCkb,
    // CKBoost custom cell types
    Protocol,
    Campaign, 
    User,
    // Unidentified
    Unidentified,
}

impl From<CellClass> for CKBoostCellClass {
    fn from(class: CellClass) -> Self {
        match class {
            CellClass::Known(name) => match name.as_str() {
                "udt" => CKBoostCellClass::Udt,
                "spore" => CKBoostCellClass::Spore,
                "simple_ckb" => CKBoostCellClass::SimpleCkb,
                _ => CKBoostCellClass::Unidentified,
            },
            CellClass::Custom(id) => match core::str::from_utf8(&id) {
                Ok("protocol") => CKBoostCellClass::Protocol,
                Ok("campaign") => CKBoostCellClass::Campaign,
                Ok("user") => CKBoostCellClass::User,
                _ => CKBoostCellClass::Unidentified,
            },
            CellClass::Unidentified => CKBoostCellClass::Unidentified,
        }
    }
}

impl Into<CellClass> for CKBoostCellClass {
    fn into(self) -> CellClass {
        match self {
            // Known CKB cell types
            CKBoostCellClass::Udt => CellClass::known("udt"),
            CKBoostCellClass::Spore => CellClass::known("spore"),
            CKBoostCellClass::SimpleCkb => CellClass::known("simple_ckb"),
            // CKBoost custom cell types
            CKBoostCellClass::Protocol => CellClass::custom(b"protocol".to_vec()),
            CKBoostCellClass::Campaign => CellClass::custom(b"campaign".to_vec()),
            CKBoostCellClass::User => CellClass::custom(b"user".to_vec()),
            // Unidentified
            CKBoostCellClass::Unidentified => CellClass::Unidentified,
        }
    }
}

/// CKBoost-specific classified cells container
#[derive(Debug)]
pub struct CKBoostClassifiedCells {
    inner: ckb_deterministic::cell_classifier::ClassifiedCells,
}

impl CKBoostClassifiedCells {
    pub fn new(classified: ckb_deterministic::cell_classifier::ClassifiedCells) -> Self {
        Self { inner: classified }
    }
    
    // Known CKB cell type accessors
    /// Get UDT cells
    pub fn udt_cells(&self) -> Option<&Vec<CellInfo>> {
        self.inner.get_known("udt")
    }
    
    /// Get Spore cells
    pub fn spore_cells(&self) -> Option<&Vec<CellInfo>> {
        self.inner.get_known("spore")
    }
    
    /// Get simple CKB cells
    pub fn simple_ckb_cells(&self) -> Option<&Vec<CellInfo>> {
        self.inner.get_known("simple_ckb")
    }
    
    /// Get other known cells by name
    pub fn known_cells(&self, name: &str) -> Option<&Vec<CellInfo>> {
        self.inner.get_known(name)
    }
    
    // CKBoost custom cell type accessors
    /// Get protocol cells
    pub fn protocol_cells(&self) -> Option<&Vec<CellInfo>> {
        self.inner.get_custom(b"protocol")
    }
    
    /// Get campaign cells
    pub fn campaign_cells(&self) -> Option<&Vec<CellInfo>> {
        self.inner.get_custom(b"campaign")
    }
    
    /// Get user cells
    pub fn user_cells(&self) -> Option<&Vec<CellInfo>> {
        self.inner.get_custom(b"user")
    }
    
    /// Get custom cells by identifier
    pub fn custom_cells(&self, id: &[u8]) -> Option<&Vec<CellInfo>> {
        self.inner.get_custom(id)
    }
    
    /// Get unidentified cells
    pub fn unidentified_cells(&self) -> &Vec<CellInfo> {
        &self.inner.unidentified_cells
    }
    
    /// Check if there are any unidentified cells
    pub fn has_unidentified_cells(&self) -> bool {
        self.inner.has_unidentified_cells()
    }
    
    /// Get total count of all cells
    pub fn total_cell_count(&self) -> usize {
        self.inner.total_cell_count()
    }
    
    /// Get count of identified cells only
    pub fn identified_cell_count(&self) -> usize {
        self.inner.identified_cell_count()
    }
    
    /// Get access to underlying generic classified cells
    pub fn inner(&self) -> &ckb_deterministic::cell_classifier::ClassifiedCells {
        &self.inner
    }
    
    /// Create from generic classified cells by copying cell data
    pub fn from_generic(classified: &ckb_deterministic::cell_classifier::ClassifiedCells) -> Self {
        // Create a new ClassifiedCells and manually copy data
        let mut new_classified = ckb_deterministic::cell_classifier::ClassifiedCells::new();
        
        // Copy known cells by accessing each type
        let known_cell_types = ["udt", "spore", "simple_ckb"];
        for cell_type in &known_cell_types {
            if let Some(cells) = classified.get_known(cell_type) {
                for cell in cells {
                    new_classified.add_cell(cell.clone(), ckb_deterministic::cell_classifier::CellClass::known(*cell_type));
                }
            }
        }
        
        // Copy custom cells by accessing each CKBoost type
        let custom_cell_types: [&[u8]; 3] = [b"protocol", b"campaign", b"user"];
        for cell_id in &custom_cell_types {
            if let Some(cells) = classified.get_custom(cell_id) {
                for cell in cells {
                    new_classified.add_cell(cell.clone(), ckb_deterministic::cell_classifier::CellClass::custom(cell_id.to_vec()));
                }
            }
        }
        
        // Copy unidentified cells
        for cell in &classified.unidentified_cells {
            new_classified.add_cell(cell.clone(), ckb_deterministic::cell_classifier::CellClass::Unidentified);
        }
        
        Self { inner: new_classified }
    }
}

/// CKBoost cell collector
pub struct CKBoostCellCollector {
    collector: CellCollector<RuleBasedClassifier>,
}

impl CKBoostCellCollector {
    /// Create a new CKBoost cell collector from protocol data
    pub fn new() -> Result<Self, Error> {
        let protocol_data = crate::protocol_data::get_protocol_data()?;
        Self::from_protocol_data(&protocol_data)
    }
    
    /// Create a CKBoost cell collector from protocol data
    pub fn from_protocol_data(data: &crate::protocol_data::ProtocolData) -> Result<Self, Error> {
        use ckb_std::debug;
        debug!("Creating CKBoost cell collector from protocol data");
        
        // Start with universal known scripts classifier
        let mut classifier = create_universal_classifier("CKBoostClassifier");
                
        // Add all accepted UDT type hashes as known cells
        let udt_hashes = data.accepted_udt_type_hashes();
        debug!("Adding {} UDT type hashes to classifier", udt_hashes.len());
        for udt_hash in udt_hashes {
            classifier = classifier.add_rule(ClassificationRule::TypeCodeHash {
                code_hash: udt_hash,
                class: KnownScript::XUdt.cell_class(),
            });
        }
        
        // Add all accepted DOB (Digital Object) type hashes as known cells
        // This could include Spore, mNFT, etc.
        let dob_hashes = data.accepted_dob_type_hashes();
        debug!("Adding {} DOB type hashes to classifier", dob_hashes.len());
        for dob_hash in dob_hashes {
            // For now, treat all DOBs as Spore
            classifier = classifier.add_rule(ClassificationRule::TypeCodeHash {
                code_hash: dob_hash,
                class: KnownScript::Spore.cell_class(),
            });
        }
        
        debug!("Built classifier with known scripts");
        
        // Add CKBoost custom cell types (always required)
        classifier = classifier
            .add_type_hash(data.protocol_type_hash(), CellClass::custom(b"protocol".to_vec()))
            .add_type_hash(data.campaign_type_hash(), CellClass::custom(b"campaign".to_vec()))
            .add_type_hash(data.user_type_hash(), CellClass::custom(b"user".to_vec()));
            
        debug!("Added CKBoost custom cell types to classifier");
            
        let collector = CellCollector::new(classifier);
        debug!("CKBoost cell collector created successfully");
        Ok(Self { collector })
    }
    
    /// Create a mock collector for testing
    pub fn mock() -> Self {
        let protocol_data = crate::protocol_data::ProtocolData::mock();
        Self::from_protocol_data(&protocol_data).expect("Mock data should be valid")
    }
    
    /// Enable or disable strict mode (reject transactions with unidentified cells)
    pub fn with_strict_mode(mut self, strict: bool) -> Self {
        self.collector = self.collector.with_strict_mode(strict);
        self
    }
    
    /// Collect and classify cells from a specific source
    pub fn collect_from_source(&self, source: Source) -> Result<CKBoostClassifiedCells, Error> {
        let classified = self.collector.collect_from_source(source)
            .map_err(|e| {
                use ckb_std::debug;
                debug!("Cell collection error from ckb_deterministic: {:?}", e);
                match e {
                    ckb_deterministic::errors::Error::UnidentifiedCells => Error::DetectedUnidentifiedCells,
                    ckb_deterministic::errors::Error::DataError => Error::DataError,
                    ckb_deterministic::errors::Error::RecipeError => Error::RecipeError,
                    ckb_deterministic::errors::Error::SystemError(code) => Error::SysError(code),
                    ckb_deterministic::errors::Error::ValidationError(_) => Error::DataError,
                }
            })?;
            
        Ok(CKBoostClassifiedCells::new(classified))
    }
    
    /// Collect and classify cells from both input and output sources
    pub fn collect_inputs_and_outputs(&self) -> Result<(CKBoostClassifiedCells, CKBoostClassifiedCells), Error> {
        let (inputs, outputs) = self.collector.collect_inputs_and_outputs()
            .map_err(|e| {
                use ckb_std::debug;
                debug!("Cell collection error from ckb_deterministic (inputs/outputs): {:?}", e);
                match e {
                    ckb_deterministic::errors::Error::UnidentifiedCells => Error::DetectedUnidentifiedCells,
                    ckb_deterministic::errors::Error::DataError => Error::DataError,
                    ckb_deterministic::errors::Error::RecipeError => Error::RecipeError,
                    ckb_deterministic::errors::Error::SystemError(code) => Error::SysError(code),
                    ckb_deterministic::errors::Error::ValidationError(_) => Error::DataError,
                }
            })?;
            
        Ok((CKBoostClassifiedCells::new(inputs), CKBoostClassifiedCells::new(outputs)))
    }
    
    /// Convert to generic collector for use with ckb_deterministic
    pub fn into_generic(self) -> CellCollector<RuleBasedClassifier> {
        self.collector
    }
}

/// Convenience function to create a default CKBoost cell collector
pub fn create_ckboost_collector() -> Result<CKBoostCellCollector, Error> {
    CKBoostCellCollector::new()
}

/// Convenience function to create a mock CKBoost cell collector for testing
pub fn create_mock_ckboost_collector() -> CKBoostCellCollector {
    CKBoostCellCollector::mock()
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_ckboost_collector() {
        let _collector = CKBoostCellCollector::mock();
        
        // Test would require mocking CKB environment
        // This is mainly for compilation verification
        // Just verify the collector can be created
        assert!(true);
    }
    
    #[test]
    fn test_cell_class_conversion() {
        // Test custom cell conversion (Protocol)
        let protocol_class = CKBoostCellClass::Protocol;
        let generic_class: CellClass = protocol_class.clone().into();
        match &generic_class {
            CellClass::Custom(id) => assert_eq!(id, b"protocol"),
            _ => panic!("Expected Custom class for Protocol"),
        }
        let converted_back: CKBoostCellClass = generic_class.into();
        assert_eq!(converted_back, protocol_class);
        
        // Test known cell conversion (UDT)
        let udt_class = CKBoostCellClass::Udt;
        let generic_class: CellClass = udt_class.clone().into();
        match &generic_class {
            CellClass::Known(name) => assert_eq!(name, "udt"),
            _ => panic!("Expected Known class for UDT"),
        }
        let converted_back: CKBoostCellClass = generic_class.into();
        assert_eq!(converted_back, udt_class);
    }
}