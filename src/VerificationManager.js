/**
 * Contract verification manager - professional-grade verification system
 * Based on Hardhat verification implementation with enhanced functionality
 */

import { ethers } from 'ethers';
import { readFileSync } from 'fs';
import { join } from 'path';
import cbor from 'cbor';

export class VerificationManager {
    constructor() {
        this.provider = null;
        this.config = null;
    }

    /**
     * Initialize verification manager with configuration
     */
    initialize(config) {
        this.config = config;
        this.provider = new ethers.JsonRpcProvider(config.activeRpcUrl);
        return this;
    }

    /**
     * Get metadata section length from bytecode
     */
    getMetadataSectionLength(bytecode) {
        const METADATA_LENGTH = 2;
        const metadataLengthSlice = bytecode.slice(-METADATA_LENGTH * 2);
        const metadataLengthBuffer = Buffer.from(metadataLengthSlice, 'hex');
        
        if (metadataLengthBuffer.length !== METADATA_LENGTH) {
            return 0;
        }
        
        return metadataLengthBuffer.readUInt16BE(0) + METADATA_LENGTH;
    }

    /**
     * Extract executable section (without metadata) from bytecode
     */
    getExecutableSection(bytecode) {
        if (bytecode.startsWith('0x')) {
            bytecode = bytecode.slice(2);
        }

        const metadataSectionLength = this.getMetadataSectionLength(bytecode);
        return bytecode.slice(0, bytecode.length - metadataSectionLength * 2);
    }

    /**
     * Decode metadata from bytecode to extract compiler information
     */
    extractMetadata(bytecode) {
        try {
            const bytecodeBuffer = Buffer.from(bytecode, 'hex');
            const metadataSectionLength = this.getMetadataSectionLength(bytecode);
            
            if (metadataSectionLength === 0) {
                return null;
            }

            const METADATA_LENGTH = 2;
            const metadataPayload = bytecodeBuffer.slice(
                -metadataSectionLength,
                -METADATA_LENGTH
            );

            const decodedMetadata = cbor.decodeFirstSync(metadataPayload);
            return decodedMetadata;
        } catch (error) {
            console.log(`⚠️  Failed to decode metadata: ${error.message}`);
            return null;
        }
    }

    /**
     * Infer compiler version from deployed bytecode metadata
     */
    inferCompilerVersion(bytecode) {
        const metadata = this.extractMetadata(bytecode);
        
        if (!metadata || !metadata.solc) {
            return null;
        }

        const solcMetadata = metadata.solc;
        
        if (Buffer.isBuffer(solcMetadata) && solcMetadata.length === 3) {
            const [major, minor, patch] = solcMetadata;
            return `${major}.${minor}.${patch}`;
        }

        return null;
    }

    /**
     * Verify contract functionality by testing ERC20 interface
     */
    async verifyContractFunctionality(contractAddress, expectedToken) {
        const tokenABI = [
            "function name() view returns (string)",
            "function symbol() view returns (string)", 
            "function decimals() view returns (uint8)",
            "function totalSupply() view returns (uint256)",
            "function balanceOf(address) view returns (uint256)"
        ];

        try {
            const contract = new ethers.Contract(contractAddress, tokenABI, this.provider);
            
            const [name, symbol, decimals, totalSupply] = await Promise.all([
                contract.name(),
                contract.symbol(),
                contract.decimals(),
                contract.totalSupply()
            ]);

            const verification = {
                responsive: true,
                name: {
                    actual: name,
                    expected: expectedToken.name,
                    matches: name === expectedToken.name
                },
                symbol: {
                    actual: symbol,
                    expected: expectedToken.symbol,
                    matches: symbol === expectedToken.symbol
                },
                decimals: {
                    actual: Number(decimals),
                    expected: expectedToken.decimals,
                    matches: Number(decimals) === expectedToken.decimals
                },
                totalSupply: {
                    actual: Number(ethers.formatUnits(totalSupply, decimals).replace('.0', '')),
                    expected: expectedToken.totalSupply,
                    matches: Number(ethers.formatUnits(totalSupply, decimals).replace('.0', '')) === expectedToken.totalSupply
                }
            };

            verification.allMatch = verification.name.matches && 
                                  verification.symbol.matches && 
                                  verification.decimals.matches && 
                                  verification.totalSupply.matches;

            return verification;

        } catch (error) {
            return {
                responsive: false,
                error: error.message
            };
        }
    }

    /**
     * Analyze contract bytecode for security patterns
     */
    analyzeContractSecurity(bytecode) {
        const analysis = {
            hasMetadata: false,
            compilerVersion: null,
            hasIpfsHash: false,
            hasSelfDestruct: false,
            size: bytecode.length,
            warnings: []
        };

        // Check metadata
        const metadata = this.extractMetadata(bytecode);
        if (metadata) {
            analysis.hasMetadata = true;
            analysis.compilerVersion = this.inferCompilerVersion(bytecode);
            analysis.hasIpfsHash = !!metadata.ipfs;
        }

        // Check for self-destruct patterns (more precise detection)
        const lowerBytecode = bytecode.toLowerCase();
        if (lowerBytecode.includes('selfdestruct') || 
            (lowerBytecode.includes('ff') && lowerBytecode.includes('suicide'))) {
            analysis.hasSelfDestruct = true;
            analysis.warnings.push('Contract may contain self-destruct functionality');
        }

        // Check bytecode size
        if (bytecode.length > 49152) { // 24KB limit
            analysis.warnings.push('Contract size is close to or exceeds deployment limit');
        }

        return analysis;
    }

    /**
     * Perform comprehensive contract verification
     */
    async verifyContract(contractAddress, deploymentInfo) {
        const verificationResult = {
            timestamp: new Date().toISOString(),
            contractAddress,
            networkChainId: deploymentInfo.networkChainId,
            success: false,
            checks: {},
            summary: {
                passed: 0,
                failed: 0,
                warnings: 0
            }
        };

        try {
            console.log('🔍 Starting comprehensive contract verification...');
            console.log(`📍 Contract: ${contractAddress}`);
            console.log(`🌐 Network Chain ID: ${deploymentInfo.networkChainId}\n`);

            // 1. Contract existence check
            console.log('1️⃣  Checking contract existence...');
            const deployedCode = await this.provider.getCode(contractAddress);
            
            if (deployedCode === '0x') {
                verificationResult.checks.existence = {
                    passed: false,
                    message: 'No contract found at address'
                };
                verificationResult.summary.failed++;
                return verificationResult;
            }

            verificationResult.checks.existence = {
                passed: true,
                message: 'Contract exists on blockchain'
            };
            verificationResult.summary.passed++;
            console.log('   ✅ Contract exists on blockchain');

            // 2. Functionality verification
            console.log('\n2️⃣  Verifying contract functionality...');
            const functionality = await this.verifyContractFunctionality(
                contractAddress, 
                deploymentInfo.token
            );

            if (!functionality.responsive) {
                verificationResult.checks.functionality = {
                    passed: false,
                    message: `Contract not responsive: ${functionality.error}`
                };
                verificationResult.summary.failed++;
            } else if (functionality.allMatch) {
                verificationResult.checks.functionality = {
                    passed: true,
                    message: 'All token parameters match expected values',
                    details: functionality
                };
                verificationResult.summary.passed++;
                console.log('   ✅ Contract responds correctly to ERC20 calls');
                console.log('   ✅ All token parameters match deployment configuration');
            } else {
                verificationResult.checks.functionality = {
                    passed: false,
                    message: 'Some token parameters do not match',
                    details: functionality
                };
                verificationResult.summary.failed++;
                console.log('   ❌ Some token parameters do not match expected values');
            }

            // 3. Bytecode analysis
            console.log('\n3️⃣  Analyzing contract bytecode...');
            const deployedBytecode = deployedCode.replace(/^0x/, '');
            const securityAnalysis = this.analyzeContractSecurity(deployedBytecode);

            verificationResult.checks.bytecode = {
                passed: securityAnalysis.hasMetadata && securityAnalysis.compilerVersion,
                message: securityAnalysis.hasMetadata ? 
                    `Valid bytecode with metadata (compiler: ${securityAnalysis.compilerVersion})` :
                    'No valid metadata found in bytecode',
                details: securityAnalysis
            };

            if (securityAnalysis.hasMetadata) {
                verificationResult.summary.passed++;
                console.log(`   ✅ Valid metadata found (compiler: ${securityAnalysis.compilerVersion})`);
                
                if (securityAnalysis.hasIpfsHash) {
                    console.log('   ✅ IPFS hash present (source code integrity)');
                }
            } else {
                verificationResult.summary.failed++;
                console.log('   ❌ No valid metadata found');
            }

            // 4. Security warnings
            if (securityAnalysis.warnings.length > 0) {
                verificationResult.summary.warnings += securityAnalysis.warnings.length;
                console.log('\n⚠️  Security warnings:');
                securityAnalysis.warnings.forEach(warning => {
                    console.log(`   ⚠️  ${warning}`);
                });
            }

            // 5. Compiler version check
            console.log('\n4️⃣  Verifying compiler version...');
            
            // If no expected compiler version, get it from build artifacts or solc
            let expectedCompilerVersion = deploymentInfo.compilerVersion;
            if (!expectedCompilerVersion) {
                try {
                    // Try to get from build/Token.json
                    const buildPath = join(process.cwd(), 'build', 'Token.json');
                    const fs = require('fs');
                    if (fs.existsSync(buildPath)) {
                        const buildData = JSON.parse(fs.readFileSync(buildPath, 'utf8'));
                        if (buildData.compiler?.version) {
                            expectedCompilerVersion = buildData.compiler.version;
                        }
                    }
                    
                    // Fallback to current solc version
                    if (!expectedCompilerVersion) {
                        try {
                            const solc = require('solc');
                            const version = solc.version();
                            expectedCompilerVersion = version.split('+')[0]; // Get just the version number
                        } catch (e) {
                            expectedCompilerVersion = '0.8.20'; // Default fallback
                        }
                    }
                } catch (e) {
                    expectedCompilerVersion = '0.8.20'; // Default fallback
                }
            }
            
            if (securityAnalysis.compilerVersion === expectedCompilerVersion) {
                verificationResult.checks.compiler = {
                    passed: true,
                    message: `Compiler version matches (${securityAnalysis.compilerVersion})`
                };
                verificationResult.summary.passed++;
                console.log(`   ✅ Compiler version matches: ${securityAnalysis.compilerVersion}`);
            } else {
                verificationResult.checks.compiler = {
                    passed: false,
                    message: `Compiler version mismatch: deployed ${securityAnalysis.compilerVersion}, expected ${expectedCompilerVersion}`
                };
                verificationResult.summary.failed++;
                console.log(`   ⚠️  Compiler version mismatch`);
            }

            // Final assessment
            const criticalChecks = ['existence', 'functionality'];
            const criticalPassed = criticalChecks.every(check => 
                verificationResult.checks[check]?.passed
            );

            verificationResult.success = criticalPassed;

            // Summary
            console.log('\n📊 VERIFICATION SUMMARY');
            console.log('========================');
            console.log(`✅ Passed: ${verificationResult.summary.passed}`);
            console.log(`❌ Failed: ${verificationResult.summary.failed}`);
            console.log(`⚠️  Warnings: ${verificationResult.summary.warnings}`);
            
            if (verificationResult.success) {
                console.log('\n🎉 VERIFICATION SUCCESSFUL');
                console.log('Contract is deployed correctly and functioning as expected.');
            } else {
                console.log('\n❌ VERIFICATION FAILED');
                console.log('Critical issues found that need attention.');
            }

            return verificationResult;

        } catch (error) {
            verificationResult.checks.error = {
                passed: false,
                message: `Verification failed: ${error.message}`
            };
            verificationResult.summary.failed++;
            console.error(`\n❌ Verification error: ${error.message}`);
            return verificationResult;
        }
    }

    /**
     * Generate verification report
     */
    generateReport(verificationResult) {
        const report = {
            title: 'Smart Contract Verification Report',
            timestamp: verificationResult.timestamp,
            contract: verificationResult.contractAddress,
            networkChainId: verificationResult.networkChainId,
            status: verificationResult.success ? 'PASSED' : 'FAILED',
            summary: verificationResult.summary,
            details: verificationResult.checks
        };

        return report;
    }
}
