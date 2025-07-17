use crate::error::Error;
use alloc::vec::Vec;


/// Trait for types that can be encoded/decoded as SSRI arguments
pub trait SSRICodec: Sized {
    fn encode(&self) -> Vec<u8>;
    fn decode(data: &[u8]) -> Result<Self, Error>;
}

/// SSRI method handler trait
pub trait SSRIMethod {
    /// The method path for this handler
    const METHOD_PATH: &'static str;
    
    /// Verify the method can be executed in current context
    fn verify(&self) -> Result<(), Error>;
}

/// Helper to encode multiple arguments for SSRI
pub struct ArgumentEncoder {
    args: Vec<Vec<u8>>,
}

impl ArgumentEncoder {
    pub fn new() -> Self {
        Self { args: Vec::new() }
    }
    
    pub fn add<T: SSRICodec>(mut self, arg: &T) -> Self {
        self.args.push(arg.encode());
        self
    }
    
    pub fn add_raw(mut self, arg: Vec<u8>) -> Self {
        self.args.push(arg);
        self
    }
    
    pub fn build(self) -> Vec<Vec<u8>> {
        self.args
    }
}

/// Helper to decode arguments from SSRI
pub struct ArgumentDecoder<'a> {
    args: &'a [Vec<u8>],
    index: usize,
}

impl<'a> ArgumentDecoder<'a> {
    pub fn new(args: &'a [Vec<u8>]) -> Self {
        Self { args, index: 0 }
    }
    
    pub fn next<T: SSRICodec>(&mut self) -> Result<T, Error> {
        if self.index >= self.args.len() {
            return Err(Error::ArgumentNotFound);
        }
        
        let data = &self.args[self.index];
        self.index += 1;
        T::decode(data)
    }
    
    pub fn next_raw(&mut self) -> Result<&'a [u8], Error> {
        if self.index >= self.args.len() {
            return Err(Error::ArgumentNotFound);
        }
        
        let data = &self.args[self.index];
        self.index += 1;
        Ok(data)
    }
    
    pub fn remaining(&self) -> usize {
        self.args.len().saturating_sub(self.index)
    }
}